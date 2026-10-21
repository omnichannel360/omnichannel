/**
 * Structured Logger with Context
 * Provides production-safe error logging with request correlation IDs,
 * stack traces, and contextual information.
 */

// FIXED: Moved inline to avoid circular dependency with crypto-utils
import { randomUUID } from 'crypto'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  correlationId?: string
  requestId?: string
  userId?: string
  userEmail?: string
  email?: string
  username?: string
  operation?: string
  route?: string
  method?: string
  path?: string
  statusCode?: number
  status?: number
  duration?: number
  responseTimeMs?: number
  response_time?: number
  authenticated?: boolean
  severity?: string
  detail?: string
  dbName?: string
  query?: Record<string, unknown>
  body?: Record<string, unknown>
  user?: Record<string, unknown>
  request?: Record<string, unknown>
  error?: string
  id?: number
  success?: boolean
  [key: string]: unknown
}

export interface LogEntry {
  service?: string
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
  error?: {
    name: string
    message: string
    stack?: string
    code?: string
  }
  meta?: Record<string, unknown>
}

export interface LoggerOptions {
  enableDebug?: boolean
  minLevel?: LogLevel
}

/**
 * Sanitizes context to remove sensitive data before logging
 */
function sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
  // Sensitive field patterns (case-insensitive matching)
  const sensitivePatterns = [
    'password',
    'pwd',
    'token',
    'access_token',
    'accesstoken',
    'refresh_token',
    'refreshtoken',
    'api_key',
    'apikey',
    'secret',
    'authorization',
    'auth',
    'session_id',
    'sessionid',
    'credit_card',
    'creditcard',
    'ssn',
    'social_security',
    'pin',
    'private_key',
    'privatekey',
    'client_secret',
    'clientsecret',
    'sk-'
  ]

  const shouldRedact = (key: string): boolean => {
    const lowerKey = key.toLowerCase()
    return sensitivePatterns.some(pattern => lowerKey.includes(pattern))
  }

  const sanitizeRecursive = (obj: unknown): unknown => {
    if (obj === null || obj === undefined) {
      return obj
    }

    if (typeof obj === 'string') {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeRecursive(item))
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(obj)) {
        if (shouldRedact(key)) {
          result[key] = '[REDACTED]'
        } else {
          result[key] = sanitizeRecursive(value)
        }
      }
      return result
    }

    return obj
  }

  return sanitizeRecursive(context) as Record<string, unknown>
}

/**
 * Formats an error object for logging
 */
function formatError(error: unknown): { name: string; message: string; stack?: string; code?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as Error & { code?: string }).code
    }
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error
    }
  }

  return {
    name: 'UnknownError',
    message: String(error)
  }
}

/**
 * Production logger with structured output and context awareness
 */
export class Logger {
  public readonly serviceName: string
  private enableDebug: boolean
  private minLevel: LogLevel
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  }

  constructor(serviceName: string, options: LoggerOptions = {}) {
    this.serviceName = serviceName
    this.enableDebug = options.enableDebug ?? false
    this.minLevel = options.minLevel ?? (this.enableDebug ? 'debug' : 'info')
  }

  /**
   * Set minimum log level
   */
  public setMinLevel(level: LogLevel): void {
    this.minLevel = level
  }

  /**
   * Check if a level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.minLevel]
  }

  /**
   * Format and output log entry
   */
  private output(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return
    }

    // Build structured output with service context
    const output: LogEntry = {
      service: this.serviceName,
      ...entry,
      context: entry.context ? (sanitizeContext(entry.context) as LogContext) : undefined
    }

    const logOutput = JSON.stringify(output)
    if (entry.level === 'error') {
      console.error(logOutput)
    } else if (entry.level === 'warn') {
      console.warn(logOutput)
    } else {
      console.log(logOutput)
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext, meta?: Record<string, unknown>): void {
    this.output({
      timestamp: new Date().toISOString(),
      level: 'debug',
      message,
      context,
      meta
    })
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext, meta?: Record<string, unknown>): void {
    this.output({
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      context,
      meta
    })
  }

  /**
   * Log warning
   */
  warn(message: string, context?: LogContext, meta?: Record<string, unknown>): void {
    this.output({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      context,
      meta
    })
  }

  /**
   * Log error with full context and stack trace
   */
  error(
    message: string,
    error: unknown,
    context?: LogContext,
    meta?: Record<string, unknown>
  ): void {
    this.output({
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      context,
      error: formatError(error),
      meta
    })
  }

  /**
   * Log operation with duration and success status
   */
  logOperation(
    operationName: string,
    duration: number,
    success: boolean,
    context?: LogContext
  ): void {
    const level = success ? 'info' : 'warn'
    const message = `Operation '${operationName}' ${success ? 'completed' : 'failed'} in ${duration}ms`

    this.output({
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...context,
        operation: operationName,
        duration,
        success
      }
    })
  }
}

/**
 * Factory function to create logger instances
 */
export function createLogger(serviceName: string, options: LoggerOptions = {}): Logger {
  return new Logger(serviceName, options)
}

// Export default singleton instance for backward compatibility
export const logger = createLogger('default')

/**
 * Generate secure random ID for correlation tracking
 * Uses crypto.randomUUID when available, falls back to secure random bytes
 */
/**
 * Generate a secure ID using Node.js crypto module
 * FIXED: Uses randomUUID directly to avoid circular dependency
 */
function generateSecureId(): string {
  try {
    // Node.js 15+ has built-in randomUUID
    return randomUUID()
  } catch (error) {
    // SECURITY: Cryptographic randomness is required for UUIDs
    // Throw error instead of falling back to Math.random() (non-cryptographic)
    throw new Error(
      'UUID generation failed: crypto.randomUUID not available. ' +
      'This is a critical security failure - the system cannot generate secure identifiers. ' +
      'Ensure Node.js crypto module is available and not disabled. ' +
      `Original error: ${error instanceof Error ? error.message : 'Unknown'}`,
      { cause: error }
    )
  }
}

/**
 * Create a logger context helper
 * Uses secure UUID generation for correlation IDs
 */
export function createLogContext(overrides?: Partial<LogContext>): LogContext {
  return {
    correlationId: generateSecureId(),
    timestamp: new Date().toISOString(),
    ...overrides
  }
}

/**
 * Extract error message safely
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'An unexpected error occurred'
}
