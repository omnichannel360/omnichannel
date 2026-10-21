/**
 * Centralized Error Handling Utilities
 * Provides:
 * - Correlation ID generation and propagation
 * - Structured error response formatting
 * - Error context enrichment
 * - Production-safe error messages
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern
 * - Timeout protection
 */

import { NextResponse } from 'next/server'
import { generateId } from './uuid'

/**
 * Error response envelope with context
 */
export interface ErrorResponse {
  success: false
  error: string
  code: string
  requestId: string
  timestamp: string
  details?: Record<string, unknown>
}

/**
 * Success response envelope
 */
export interface SuccessResponse<T> {
  success: true
  data?: T
  requestId: string
  timestamp: string
}

/**
 * Generate a correlation ID for request tracing
 * Format: timestamp-uuid (e.g., 1698765432000-a1b2c3d4)
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now()
  const uuid = generateId().split('-')[0] // Take first segment of UUID
  return `${timestamp}-${uuid}`
}

/**
 * Extract correlation ID from request headers
 * Fallback to generating new one if not present
 */
export function getOrCreateCorrelationId(correlationIdHeader?: string | null): string {
  if (correlationIdHeader && typeof correlationIdHeader === 'string') {
    return correlationIdHeader
  }
  return generateCorrelationId()
}

/**
 * Create a structured error response with full context
 */
export function createErrorResponse(
  error: string,
  code: string,
  requestId: string,
  statusCode: number,
  details?: Record<string, unknown>
): NextResponse {
  const response: ErrorResponse = {
    success: false,
    error,
    code,
    requestId,
    timestamp: new Date().toISOString(),
    ...(details && { details }),
  }

  return NextResponse.json(response, { status: statusCode })
}

/**
 * Create a structured success response
 */
export function createSuccessResponse<T>(
  data: T | undefined,
  requestId: string
): { success: true; data?: T; requestId: string; timestamp: string } {
  return {
    success: true,
    ...(data !== undefined && { data }),
    requestId,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Error codes for different failure scenarios
 */
export const ERROR_CODES = {
  // Authentication
  AUTH_MISSING: 'AUTH_MISSING',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  NOT_FOUND: 'NOT_FOUND',

  // Business logic
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/**
 * Map error codes to HTTP status codes
 */
export function getHttpStatus(code: ErrorCode): number {
  const statusMap: Record<ErrorCode, number> = {
    [ERROR_CODES.AUTH_MISSING]: 401,
    [ERROR_CODES.AUTH_INVALID]: 401,
    [ERROR_CODES.AUTH_EXPIRED]: 401,
    [ERROR_CODES.INSUFFICIENT_PERMISSIONS]: 403,
    [ERROR_CODES.VALIDATION_ERROR]: 400,
    [ERROR_CODES.INVALID_INPUT]: 400,
    [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 429,
    [ERROR_CODES.INTERNAL_ERROR]: 500,
    [ERROR_CODES.SERVICE_UNAVAILABLE]: 503,
    [ERROR_CODES.NOT_FOUND]: 404,
    [ERROR_CODES.RESOURCE_NOT_FOUND]: 404,
    [ERROR_CODES.CONFLICT]: 409,
  }
  return statusMap[code] || 500
}

/**
 * Safe error message extraction
 * Prevents leaking sensitive information in production
 */
export function getSafeErrorMessage(error: unknown, defaultMessage: string): string {
  if (error instanceof Error) {
    // In production, only return safe error messages
    if (process.env.NODE_ENV === 'production') {
      // Specific error types that are safe to expose
      if (error.message.includes('validation') || error.message.includes('invalid')) {
        return error.message
      }
      return defaultMessage
    }
    return error.message
  }

  return defaultMessage
}

/**
 * Extract error details for logging
 */
export function getErrorDetails(error: unknown): {
  message: string
  stack?: string
  name?: string
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    }
  }

  if (typeof error === 'string') {
    return { message: error }
  }

  return {
    message: 'Unknown error',
    ...(error && { details: JSON.stringify(error) }),
  }
}

/**
 * Format error for logging with context
 */
export function formatErrorLog(
  message: string,
  error: unknown,
  context: {
    requestId: string
    method?: string
    path?: string
    userId?: string
    statusCode?: number
    [key: string]: unknown
  }
): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    message,
    requestId: context.requestId,
    ...context,
    error: getErrorDetails(error),
  }
}

/**
 * Standard error handler for API routes
 * Handles common error scenarios with appropriate responses
 */
export function handleRouteError(
  error: unknown,
  requestId: string,
  context: {
    method: string
    path: string
    userId?: string
    operation?: string
    [key: string]: unknown
  }
): { response: NextResponse; statusCode: number } {
  let code: ErrorCode = ERROR_CODES.INTERNAL_ERROR
  let userMessage = 'An unexpected error occurred'
  let statusCode = 500
  let details: Record<string, unknown> | undefined

  // Handle specific error types
  if (error instanceof SyntaxError) {
    code = ERROR_CODES.INVALID_INPUT
    userMessage = 'Invalid request format'
    statusCode = 400
  } else if (error instanceof Error) {
    const errorMessage = error.message

    // Validation errors
    if (
      errorMessage.includes('validation') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('schema')
    ) {
      code = ERROR_CODES.VALIDATION_ERROR
      userMessage = getSafeErrorMessage(error, 'Validation failed')
      statusCode = 400
      details = { message: errorMessage }
    }
    // File not found
    else if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
      code = ERROR_CODES.RESOURCE_NOT_FOUND
      userMessage = 'Resource not found'
      statusCode = 404
    }
    // Access denied
    else if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
      code = ERROR_CODES.INSUFFICIENT_PERMISSIONS
      userMessage = 'Access denied'
      statusCode = 403
    }
    // Timeout
    else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      code = ERROR_CODES.SERVICE_UNAVAILABLE
      userMessage = 'Request timeout'
      statusCode = 503
    }
  }

  const response = createErrorResponse(userMessage, code, requestId, statusCode, details)

  return { response, statusCode }
}

/**
 * Validate request method
 */
export function validateRequestMethod(method: string, allowed: string[]): boolean {
  return allowed.includes(method)
}

/**
 * Extract correlation ID from request
 */
export function extractCorrelationFromRequest(headers: Headers): string {
  return getOrCreateCorrelationId(headers.get('x-correlation-id') || headers.get('x-request-id'))
}

/**
 * Retry configuration for different error types
 */
export interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  isRetryable: (error: unknown) => boolean
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  isRetryable: (error: unknown) => {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase()
      return (
        msg.includes('timeout') ||
        msg.includes('econnrefused') ||
        msg.includes('service unavailable') ||
        msg.includes('econnreset')
      )
    }
    return false
  },
}

/**
 * Exponential backoff retry mechanism
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: unknown
  let delay = config.initialDelayMs

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (attempt === config.maxRetries || !config.isRetryable(error)) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, delay))
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs)
    }
  }

  throw lastError
}

/**
 * Circuit breaker for protecting dependent services
 * FIXED: Immutable state transitions to prevent race conditions
 */
export class CircuitBreaker {
  private failureCount = 0
  private successCount = 0
  private lastFailureTime = 0
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'

  constructor(
    private failureThreshold: number = 5,
    private successThreshold: number = 2,
    private resetTimeoutMs: number = 60000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // FIXED: Renamed method to indicate it has side effects (state mutation)
    const currentState = this.transitionStateIfNeeded()

    if (currentState === 'OPEN') {
      throw new Error('Circuit breaker is OPEN - service unavailable')
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  /**
   * Transition state from OPEN to HALF_OPEN if timeout has passed.
   * CRITICAL SIDE EFFECT: This method MUTATES internal state (this.state, this.successCount).
   * Must NOT be called as a pure getter. Always intended as part of execute() flow.
   */
  private transitionStateIfNeeded(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    if (this.state === 'OPEN') {
      const now = Date.now()
      if (now - this.lastFailureTime > this.resetTimeoutMs) {
        // Atomically transition from OPEN to HALF_OPEN
        this.state = 'HALF_OPEN'
        this.successCount = 0
        return 'HALF_OPEN'
      }
    }
    return this.state
  }

  private onSuccess(): void {
    this.failureCount = 0
    if (this.state === 'HALF_OPEN') {
      this.successCount++
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED'
        this.successCount = 0
      }
    }
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    this.successCount = 0

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN'
    }
  }

  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state
  }
}

/**
 * Timeout utility for async operations
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = 'Operation timeout'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    ),
  ])
}

/**
 * Validate and sanitize error details for logging
 */
export function sanitizeErrorDetails(details: unknown): Record<string, unknown> | undefined {
  if (!details) return undefined

  if (typeof details === 'object') {
    const sanitized: Record<string, unknown> = {}
    const sensitivePatterns = ['password', 'token', 'secret', 'key', 'credential', 'auth']

    for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase()

      if (sensitivePatterns.some((pattern) => lowerKey.includes(pattern))) {
        continue
      }

      if (typeof value === 'string' && value.length < 500) {
        sanitized[key] = value
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value
      }
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined
  }

  return undefined
}
