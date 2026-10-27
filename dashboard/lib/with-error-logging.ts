/**
 * Error Logging Wrapper for API Routes
 * Ensures all errors are logged with full context before returning to client
 */

import { NextRequest, NextResponse } from 'next/server'
import { createLogger, LogContext } from '@/lib/logger'
import {
  extractRequestContext,
  getOrCreateCorrelationId
} from '@/lib/middleware/error-context'

const logger = createLogger('api-handler')

export interface ErrorLoggingOptions {
  serviceName?: string
  logStackTrace?: boolean
  logRequestBody?: boolean
  sensitiveFields?: string[]
}

/**
 * Wraps an API route handler to add comprehensive error logging
 * Logs errors with:
 * - Full request context (method, path, headers, correlation ID)
 * - Request body (if enabled and not sensitive)
 * - Error details (message, stack, code)
 * - Response context (status code, duration)
 */
export function withErrorLogging(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: ErrorLoggingOptions = {}
): (request: NextRequest) => Promise<NextResponse> {
  const {
    serviceName = 'api-route',
    logStackTrace = true,
    logRequestBody = false,
    sensitiveFields = [
      'password',
      'token',
      'apiKey',
      'secret',
      'jwt',
      'authorization',
      'bearer',
      'session',
      'sessionId',
      'refreshToken',
      'accessToken',
      'privkey',
      'private_key',
      'api_key',
      'api_secret',
      'auth_token',
      'x-api-key',
    ]
  } = options

  return async (request: NextRequest) => {
    const startTime = Date.now()
    const correlationId = getOrCreateCorrelationId(request)

    try {
      // Extract request context before execution
      // Get first IP from x-forwarded-for header (can be comma-separated list)
      const xForwardedFor = request.headers.get('x-forwarded-for')
      const ipAddress = xForwardedFor
        ? xForwardedFor.split(',')[0].trim()
        : 'unknown'

      const requestContext: LogContext = {
        ...extractRequestContext(request),
        correlationId,
        path: request.nextUrl.pathname,
        method: request.method,
        userAgent: request.headers.get('user-agent') || undefined,
        ipAddress
      }

      // Log request start
      logger.debug(`Incoming ${request.method} request`, requestContext)

      // Execute the handler
      const response = await handler(request)

      // Log successful response
      const duration = Date.now() - startTime
      if (response.status >= 400) {
        logger.warn(`Request completed with error status`, {
          ...requestContext,
          statusCode: response.status,
          duration
        })
      } else {
        logger.info(`Request completed successfully`, {
          ...requestContext,
          statusCode: response.status,
          duration
        })
      }

      // Propagate correlation ID on success too (error path already sets it)
      response.headers.set('x-correlation-id', correlationId)

      return response
    } catch (error) {
      const duration = Date.now() - startTime

      // Extract error details safely
      const errorMessage = error instanceof Error
        ? error.message
        : (typeof error === 'string' ? error : 'Unknown error')
      const errorStack = error instanceof Error ? error.stack : undefined
      const errorWithCode = error instanceof Error
        ? (error as Error & { code?: string })
        : null
      const errorCode = errorWithCode?.code || 'UNKNOWN'

      // Build request context
      // Get first IP from x-forwarded-for header (can be comma-separated list)
      const xForwardedForError = request.headers.get('x-forwarded-for')
      const ipAddressError = xForwardedForError
        ? xForwardedForError.split(',')[0].trim()
        : 'unknown'

      const requestContext: LogContext = {
        ...extractRequestContext(request),
        correlationId,
        path: request.nextUrl.pathname,
        method: request.method,
        userAgent: request.headers.get('user-agent') || undefined,
        ipAddress: ipAddressError,
        duration,
        statusCode: 500
      }

      // Log the error with full context
      logger.error(
        `Request handler error in ${serviceName}`,
        error,
        requestContext,
        {
          errorCode,
          stackTrace: logStackTrace ? errorStack : undefined
        }
      )

      // Return standardized error response
      return NextResponse.json(
        {
          success: false,
          error: 'Internal server error',
          correlationId
        },
        { status: 500, headers: { 'x-correlation-id': correlationId } }
      )
    }
  }
}

/**
 * Wraps a handler and logs all errors with detailed context
 * Useful for non-API functions that still need logging
 */
export async function logErrors<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Partial<LogContext>
): Promise<{ success: boolean; data?: T; error?: string }> {
  const startTime = Date.now()

  try {
    const data = await fn()
    const duration = Date.now() - startTime

    logger.info(`Operation completed: ${operation}`, {
      operation,
      duration,
      ...context
    })

    return { success: true, data }
  } catch (error) {
    const duration = Date.now() - startTime

    logger.error(
      `Operation failed: ${operation}`,
      error,
      {
        operation,
        duration,
        ...context
      }
    )

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Middleware to ensure all errors in a route have logging
 */
export function createErrorLoggingMiddleware(serviceName: string) {
  return (handler: (req: NextRequest) => Promise<NextResponse>) => {
    return withErrorLogging(handler, { serviceName })
  }
}
