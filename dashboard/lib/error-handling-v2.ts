/**
 * Enhanced Error Handling System v2
 * Provides comprehensive error handling with:
 * - Extended error codes and categorization
 * - Detailed validation error information
 * - Retry logic and circuit breaker patterns
 * - Bulk operation error aggregation
 * - Enhanced error context enrichment
 * - Production-safe error messaging
 * - Structured error logging
 */

import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

/**
 * Extended error response envelope with full context
 */
export interface ErrorResponse {
  success: false
  error: string
  code: string
  requestId: string
  timestamp: string
  details?: Record<string, unknown>
  validationErrors?: ValidationErrorDetail[]
  retryable?: boolean
  retryAfterSeconds?: number
}

/**
 * Detailed validation error information
 */
export interface ValidationErrorDetail {
  field: string
  message: string
  value?: unknown
  constraint?: string
}

/**
 * Success response envelope
 */
export interface SuccessResponse<T> {
  success: true
  data?: T
  requestId: string
  timestamp: string
  meta?: {
    total?: number
    page?: number
    limit?: number
  }
}

/**
 * Bulk operation result with aggregated errors
 */
export interface BulkOperationResult<T> {
  success: boolean
  successful: T[]
  failed: Array<{
    index: number
    error: string
    details?: unknown
  }>
  total: number
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number
  delayMs: number
  backoff: 'linear' | 'exponential'
  retryableStatusCodes: number[]
}

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open'
  failures: number
  lastFailureTime?: number
  successCount: number
}

/**
 * Extended error codes for comprehensive error handling
 */
export const EXTENDED_ERROR_CODES = {
  // Authentication
  AUTH_MISSING: 'AUTH_MISSING',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  VALIDATION_FIELD_ERROR: 'VALIDATION_FIELD_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  VALUE_OUT_OF_RANGE: 'VALUE_OUT_OF_RANGE',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  RATE_LIMIT_QUOTA_EXCEEDED: 'RATE_LIMIT_QUOTA_EXCEEDED',

  // Resource errors
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  RESOURCE_LOCKED: 'RESOURCE_LOCKED',
  RESOURCE_GONE: 'RESOURCE_GONE',

  // Business logic
  OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',
  PRECONDITION_FAILED: 'PRECONDITION_FAILED',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  DEPENDENCY_NOT_FOUND: 'DEPENDENCY_NOT_FOUND',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
  DATABASE_ERROR: 'DATABASE_ERROR',
  FILE_SYSTEM_ERROR: 'FILE_SYSTEM_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',

  // Request errors
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',

  // Bulk operation errors
  BULK_OPERATION_PARTIAL_FAILURE: 'BULK_OPERATION_PARTIAL_FAILURE',
  BULK_OPERATION_TOTAL_FAILURE: 'BULK_OPERATION_TOTAL_FAILURE',
} as const

export type ExtendedErrorCode = (typeof EXTENDED_ERROR_CODES)[keyof typeof EXTENDED_ERROR_CODES]

/**
 * Map extended error codes to HTTP status codes
 */
export function getHttpStatus(code: ExtendedErrorCode): number {
  const statusMap: Record<ExtendedErrorCode, number> = {
    // 400 Bad Request
    [EXTENDED_ERROR_CODES.INVALID_INPUT]: 400,
    [EXTENDED_ERROR_CODES.VALIDATION_ERROR]: 400,
    [EXTENDED_ERROR_CODES.VALIDATION_FIELD_ERROR]: 400,
    [EXTENDED_ERROR_CODES.MISSING_REQUIRED_FIELD]: 400,
    [EXTENDED_ERROR_CODES.INVALID_FORMAT]: 400,
    [EXTENDED_ERROR_CODES.VALUE_OUT_OF_RANGE]: 400,
    [EXTENDED_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE]: 415,
    [EXTENDED_ERROR_CODES.PAYLOAD_TOO_LARGE]: 413,

    // 401 Unauthorized
    [EXTENDED_ERROR_CODES.AUTH_MISSING]: 401,
    [EXTENDED_ERROR_CODES.AUTH_INVALID]: 401,
    [EXTENDED_ERROR_CODES.AUTH_EXPIRED]: 401,
    [EXTENDED_ERROR_CODES.AUTH_INVALID_CREDENTIALS]: 401,

    // 403 Forbidden
    [EXTENDED_ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS]: 403,
    [EXTENDED_ERROR_CODES.AUTH_ACCOUNT_LOCKED]: 403,
    [EXTENDED_ERROR_CODES.OPERATION_NOT_ALLOWED]: 403,
    [EXTENDED_ERROR_CODES.PRECONDITION_FAILED]: 412,

    // 404 Not Found
    [EXTENDED_ERROR_CODES.RESOURCE_NOT_FOUND]: 404,
    [EXTENDED_ERROR_CODES.DEPENDENCY_NOT_FOUND]: 404,

    // 405 Method Not Allowed
    [EXTENDED_ERROR_CODES.METHOD_NOT_ALLOWED]: 405,

    // 409 Conflict
    [EXTENDED_ERROR_CODES.RESOURCE_ALREADY_EXISTS]: 409,
    [EXTENDED_ERROR_CODES.RESOURCE_CONFLICT]: 409,
    [EXTENDED_ERROR_CODES.INVALID_STATE_TRANSITION]: 409,

    // 410 Gone
    [EXTENDED_ERROR_CODES.RESOURCE_GONE]: 410,

    // 423 Locked
    [EXTENDED_ERROR_CODES.RESOURCE_LOCKED]: 423,

    // 429 Too Many Requests
    [EXTENDED_ERROR_CODES.RATE_LIMIT_EXCEEDED]: 429,
    [EXTENDED_ERROR_CODES.RATE_LIMIT_QUOTA_EXCEEDED]: 429,

    // 500 Internal Server Error
    [EXTENDED_ERROR_CODES.INTERNAL_ERROR]: 500,
    [EXTENDED_ERROR_CODES.DATABASE_ERROR]: 500,
    [EXTENDED_ERROR_CODES.FILE_SYSTEM_ERROR]: 500,
    [EXTENDED_ERROR_CODES.BULK_OPERATION_PARTIAL_FAILURE]: 500,
    [EXTENDED_ERROR_CODES.BULK_OPERATION_TOTAL_FAILURE]: 500,

    // 501 Not Implemented
    [EXTENDED_ERROR_CODES.NOT_IMPLEMENTED]: 501,

    // 502 Bad Gateway
    [EXTENDED_ERROR_CODES.EXTERNAL_SERVICE_ERROR]: 502,

    // 503 Service Unavailable
    [EXTENDED_ERROR_CODES.SERVICE_UNAVAILABLE]: 503,

    // 504 Gateway Timeout
    [EXTENDED_ERROR_CODES.GATEWAY_TIMEOUT]: 504,
  }
  return statusMap[code] || 500
}

/**
 * Generate a correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now()
  // Use first 8 characters of UUID (32 hex chars after removing dashes)
  const uuid = uuidv4().replace(/-/g, '').substring(0, 8)
  return `${timestamp}-${uuid}`
}

/**
 * Extract or create correlation ID from request headers
 */
export function getOrCreateCorrelationId(correlationIdHeader?: string | null): string {
  if (correlationIdHeader && typeof correlationIdHeader === 'string' && correlationIdHeader.trim()) {
    return correlationIdHeader
  }
  return generateCorrelationId()
}

/**
 * Extract correlation ID from request
 */
export function extractCorrelationFromRequest(headers: Headers): string {
  return getOrCreateCorrelationId(
    headers.get('x-correlation-id') || headers.get('x-request-id')
  )
}

/**
 * Create a structured error response with full context
 */
export function createErrorResponse(
  error: string,
  code: ExtendedErrorCode,
  requestId: string,
  statusCode: number,
  options?: {
    details?: Record<string, unknown>
    validationErrors?: ValidationErrorDetail[]
    retryable?: boolean
    retryAfterSeconds?: number
  }
): NextResponse {
  const response: ErrorResponse = {
    success: false,
    error,
    code,
    requestId,
    timestamp: new Date().toISOString(),
    ...(options?.details && { details: options.details }),
    ...(options?.validationErrors && { validationErrors: options.validationErrors }),
    ...(options?.retryable !== undefined && { retryable: options.retryable }),
    ...(options?.retryAfterSeconds && { retryAfterSeconds: options.retryAfterSeconds }),
  }

  const nextResponse = NextResponse.json(response, { status: statusCode })

  // Add appropriate headers for retryable errors
  if (options?.retryAfterSeconds) {
    nextResponse.headers.set('Retry-After', options.retryAfterSeconds.toString())
  }

  return nextResponse
}

/**
 * Create a structured success response
 */
export function createSuccessResponse<T>(
  data: T | undefined,
  requestId: string,
  meta?: { total?: number; page?: number; limit?: number }
): SuccessResponse<T> {
  return {
    success: true,
    ...(data !== undefined && { data }),
    requestId,
    timestamp: new Date().toISOString(),
    ...(meta && { meta }),
  }
}

/**
 * Safe error message extraction
 * Prevents leaking sensitive information in production
 */
export function getSafeErrorMessage(error: unknown, defaultMessage: string): string {
  if (error instanceof Error) {
    if (process.env.NODE_ENV === 'production') {
      // Safe patterns to expose in production
      const safePatterns = [
        /validation/i,
        /invalid/i,
        /required/i,
        /format/i,
        /range/i,
        /already exists/i,
        /not found/i,
      ]

      if (safePatterns.some(p => p.test(error.message))) {
        return error.message
      }
      return defaultMessage
    }
    return error.message
  }

  return defaultMessage
}

/**
 * Extract detailed error information for logging
 */
export function getErrorDetails(error: unknown): {
  message: string
  stack?: string
  name?: string
  code?: string
} {
  if (error instanceof Error) {
    const message = error.message || 'Unknown error'
    const stack = error.stack
    const name = error.name
    // Safely extract code property if it exists (already verified as string type)
    const code = 'code' in error && typeof (error as Record<string, unknown>).code === 'string'
      ? (error as Record<string, unknown>).code as string
      : undefined

    return {
      message,
      stack,
      name,
      ...(code && { code }),
    }
  }

  if (typeof error === 'string') {
    return { message: error }
  }

  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, unknown>
    const message = errorObj.message && typeof errorObj.message === 'string'
      ? errorObj.message
      : 'Unknown error'
    const code = errorObj.code && typeof errorObj.code === 'string'
      ? errorObj.code as string
      : undefined

    return {
      message,
      ...(code && { code }),
    }
  }

  return { message: 'Unknown error' }
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
    operation?: string
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
 * Enhanced error handler for API routes
 * Handles common error scenarios with detailed responses
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
): { response: NextResponse; statusCode: number; code: ExtendedErrorCode } {
  let code: ExtendedErrorCode = EXTENDED_ERROR_CODES.INTERNAL_ERROR
  let userMessage = 'An unexpected error occurred'
  let statusCode = 500
  let details: Record<string, unknown> | undefined
  let retryable = false
  let retryAfterSeconds: number | undefined

  // Handle specific error types
  if (error instanceof SyntaxError) {
    code = EXTENDED_ERROR_CODES.INVALID_INPUT
    userMessage = 'Invalid request format'
    statusCode = 400
  } else if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase()
    const errorWithCode = error as Error & { code?: string }
    const errorCode = errorWithCode.code

    // Validation errors
    if (
      errorMessage.includes('validation') ||
      errorMessage.includes('schema') ||
      errorMessage.includes('zod')
    ) {
      code = EXTENDED_ERROR_CODES.VALIDATION_ERROR
      userMessage = getSafeErrorMessage(error, 'Request validation failed')
      statusCode = 400
      details = { validation_details: errorMessage }
    }
    // Missing required field
    else if (errorMessage.includes('required')) {
      code = EXTENDED_ERROR_CODES.MISSING_REQUIRED_FIELD
      userMessage = 'Missing required field'
      statusCode = 400
      details = { message: errorMessage }
    }
    // Invalid format
    else if (
      errorMessage.includes('invalid format') ||
      errorMessage.includes('invalid date') ||
      errorMessage.includes('invalid email')
    ) {
      code = EXTENDED_ERROR_CODES.INVALID_FORMAT
      userMessage = 'Invalid data format'
      statusCode = 400
      details = { message: errorMessage }
    }
    // File not found / Resource not found
    else if (
      errorMessage.includes('enoent') ||
      errorMessage.includes('not found') ||
      errorCode === 'ENOENT'
    ) {
      code = EXTENDED_ERROR_CODES.RESOURCE_NOT_FOUND
      userMessage = 'Resource not found'
      statusCode = 404
    }
    // Access denied / Permission denied
    else if (
      errorMessage.includes('eacces') ||
      errorMessage.includes('permission') ||
      errorCode === 'EACCES'
    ) {
      code = EXTENDED_ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS
      userMessage = 'Access denied'
      statusCode = 403
    }
    // Conflict / Already exists
    else if (
      errorMessage.includes('already exists') ||
      errorMessage.includes('duplicate') ||
      errorMessage.includes('conflict')
    ) {
      code = EXTENDED_ERROR_CODES.RESOURCE_CONFLICT
      userMessage = 'Resource already exists or conflict detected'
      statusCode = 409
    }
    // Timeout
    else if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('etimedout') ||
      errorCode === 'ETIMEDOUT'
    ) {
      code = EXTENDED_ERROR_CODES.GATEWAY_TIMEOUT
      userMessage = 'Request timeout'
      statusCode = 504
      retryable = true
      retryAfterSeconds = 5
    }
    // Database errors
    else if (
      errorMessage.includes('database') ||
      errorMessage.includes('query') ||
      errorMessage.includes('connection')
    ) {
      code = EXTENDED_ERROR_CODES.DATABASE_ERROR
      userMessage = 'Database operation failed'
      statusCode = 500
      retryable = true
      retryAfterSeconds = 3
    }
    // File system errors
    else if (errorMessage.includes('file')) {
      code = EXTENDED_ERROR_CODES.FILE_SYSTEM_ERROR
      userMessage = 'File operation failed'
      statusCode = 500
      retryable = true
      retryAfterSeconds = 3
    }
    // External service errors
    else if (
      errorMessage.includes('external') ||
      errorMessage.includes('service') ||
      errorMessage.includes('fetch')
    ) {
      code = EXTENDED_ERROR_CODES.EXTERNAL_SERVICE_ERROR
      userMessage = 'External service error'
      statusCode = 502
      retryable = true
      retryAfterSeconds = 5
    }
  }

  const response = createErrorResponse(userMessage, code, requestId, statusCode, {
    details,
    retryable,
    retryAfterSeconds,
  })

  return { response, statusCode, code }
}

/**
 * Parse validation error details from Zod or similar schema validation
 */
export function parseValidationErrors(
  error: unknown
): ValidationErrorDetail[] {
  const details: ValidationErrorDetail[] = []

  // Safety check: ensure error is an object before proceeding
  if (!error || typeof error !== 'object') {
    return details
  }

  // Handle Zod errors
  const errorObj = error as Record<string, unknown>
  if (errorObj.issues && Array.isArray(errorObj.issues)) {
    errorObj.issues.forEach((issue: unknown) => {
      const issueObj = issue as Record<string, unknown>

      // Safely construct field path from path array
      let fieldPath = 'unknown'
      if (Array.isArray(issueObj.path) && issueObj.path.length > 0) {
        // Convert all path elements to strings safely
        const pathParts = issueObj.path
          .map(p => String(p || ''))
          .filter(p => p.length > 0)
        fieldPath = pathParts.length > 0 ? pathParts.join('.') : 'unknown'
      }

      details.push({
        field: fieldPath,
        message: String(issueObj.message || 'Validation error'),
        constraint: String(issueObj.code || ''),
      })
    })
  }

  return details
}

/**
 * Create response for bulk operation with mixed success/failure
 */
export function createBulkOperationResponse<T>(
  successful: T[],
  failed: Array<{ index: number; error: string; details?: unknown }>,
  requestId: string
): NextResponse {
  const total = successful.length + failed.length
  const isPartialSuccess = successful.length > 0 && failed.length > 0
  const isTotalFailure = successful.length === 0 && failed.length > 0

  if (isTotalFailure) {
    return NextResponse.json(
      {
        success: false,
        code: EXTENDED_ERROR_CODES.BULK_OPERATION_TOTAL_FAILURE,
        message: 'All operations failed',
        requestId,
        timestamp: new Date().toISOString(),
        data: { successful: [], failed, total },
      },
      { status: 500 } // Server error when all operations fail
    )
  }

  if (isPartialSuccess) {
    return NextResponse.json(
      {
        success: false,
        code: EXTENDED_ERROR_CODES.BULK_OPERATION_PARTIAL_FAILURE,
        message: 'Some operations failed',
        requestId,
        timestamp: new Date().toISOString(),
        data: { successful, failed, total },
      },
      { status: 207 } // Multi-status for mixed results
    )
  }

  return NextResponse.json(
    {
      success: true,
      requestId,
      timestamp: new Date().toISOString(),
      data: { successful, failed: [], total },
    },
    { status: 200 }
  )
}

/**
 * Retry logic with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig: RetryConfig = {
    maxRetries: 3,
    delayMs: 100,
    backoff: 'exponential',
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    ...config,
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt === fullConfig.maxRetries) {
        throw lastError
      }

      // Calculate delay
      let delay = fullConfig.delayMs
      if (fullConfig.backoff === 'exponential') {
        delay = fullConfig.delayMs * Math.pow(2, attempt)
      } else {
        delay = fullConfig.delayMs * (attempt + 1)
      }

      // Add jitter to prevent thundering herd
      delay = delay + Math.random() * delay * 0.1

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Circuit breaker for handling failing services
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = {
    state: 'closed',
    failures: 0,
    lastFailureTime: undefined,
    successCount: 0,
  }

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly resetTimeoutMs: number = 60000,
    private readonly halfOpenAttempts: number = 1
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.state === 'open') {
      if (
        this.state.lastFailureTime &&
        Date.now() - this.state.lastFailureTime > this.resetTimeoutMs
      ) {
        this.state.state = 'half-open'
        this.state.successCount = 0
      } else {
        throw new Error('Circuit breaker is OPEN')
      }
    }

    try {
      const result = await operation()

      if (this.state.state === 'half-open') {
        this.state.successCount++
        if (this.state.successCount >= this.halfOpenAttempts) {
          this.state.state = 'closed'
          this.state.failures = 0
          this.state.lastFailureTime = undefined
        }
      } else {
        this.state.failures = 0
      }

      return result
    } catch (error) {
      this.state.failures++
      this.state.lastFailureTime = Date.now()

      if (this.state.failures >= this.failureThreshold) {
        this.state.state = 'open'
      } else if (this.state.state === 'half-open') {
        this.state.state = 'open'
      }

      throw error
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state }
  }

  reset(): void {
    this.state = {
      state: 'closed',
      failures: 0,
      lastFailureTime: undefined,
      successCount: 0,
    }
  }
}
