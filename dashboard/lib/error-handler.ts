/**
 * Error Handling Middleware
 * Provides centralized error logging and response handling for all API routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { createLogger, createLogContext, getErrorMessage } from './logger'
import type { LogContext } from './logger'

const logger = createLogger('error-handler')

export interface ErrorHandlerOptions {
  serviceName?: string
  correlationId?: string
}

/**
 * Extract context from request for logging
 */
export function extractRequestContext(request: NextRequest, options?: ErrorHandlerOptions): LogContext {
  const url = new URL(request.url)
  const correlationId = request.headers.get('x-correlation-id') || options?.correlationId

  return createLogContext({
    // Only override when present, so createLogContext's generated ID is kept otherwise
    ...(correlationId && { correlationId }),
    method: request.method,
    route: url.pathname,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    userAgent: request.headers.get('user-agent') || undefined,
  })
}

/**
 * Create error response with logging
 */
export function createErrorResponse(
  error: unknown,
  context: LogContext,
  statusCode: number = 500,
  options?: { serviceName?: string; message?: string }
): NextResponse {
  const errorMessage = options?.message || getErrorMessage(error)
  const serviceName = options?.serviceName || 'api'

  // Create a logger for this service
  const serviceLogger = createLogger(serviceName)

  // Log the error with full context
  serviceLogger.error(
    `API Error: ${errorMessage}`,
    error,
    {
      ...context,
      statusCode,
      errorType: error instanceof Error ? error.name : typeof error,
    }
  )

  // Return appropriate error response based on status code
  const responseBody: Record<string, unknown> = {
    success: false,
    error: errorMessage,
  }

  // Include correlation ID for request tracking
  if (context.correlationId) {
    responseBody.correlationId = context.correlationId
  }

  // Add validation details for 400 errors
  if (statusCode === 400 && error instanceof Error) {
    if (error.message.includes('validation') || error.message.includes('invalid')) {
      responseBody.details = getErrorMessage(error)
    }
  }

  return NextResponse.json(responseBody, { status: statusCode })
}

/**
 * Wrap an API handler to add error logging
 * Usage: export const GET = withErrorLogging(async (req) => { ... }, 'health-check')
 */
export function withErrorLogging<T extends (req: NextRequest) => Promise<NextResponse>>(
  handler: T,
  serviceName: string,
  options?: ErrorHandlerOptions
): (req: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now()
    const context = extractRequestContext(request, { ...options, serviceName })
    const serviceLogger = createLogger(serviceName)

    try {
      // Log request start
      serviceLogger.debug(
        `${context.method} ${context.path} - Request started`,
        { ...context, timestamp: new Date().toISOString() }
      )

      // Execute handler
      const response = await handler(request)

      // Log response
      const duration = Date.now() - startTime
      const statusCode = response.status

      if (statusCode >= 400) {
        serviceLogger.warn(
          `${context.method} ${context.path} - Request failed with ${statusCode}`,
          { ...context, statusCode, duration }
        )
      } else {
        serviceLogger.info(
          `${context.method} ${context.path} - Request completed successfully`,
          { ...context, statusCode, duration }
        )
      }

      return response
    } catch (error) {
      const duration = Date.now() - startTime

      // Determine status code based on error type
      let statusCode = 500
      if (error instanceof Error) {
        const lowerMessage = error.message.toLowerCase()
        if (lowerMessage.includes('unauthorized') || lowerMessage.includes('forbidden')) {
          statusCode = 403
        } else if (lowerMessage.includes('not found')) {
          statusCode = 404
        } else if (lowerMessage.includes('invalid') || lowerMessage.includes('validation')) {
          statusCode = 400
        }
      }

      // Log error with full context
      serviceLogger.error(
        `${context.method} ${context.path} - Request failed`,
        error,
        { ...context, statusCode, duration, errorAt: 'handler' }
      )

      // Return error response
      return createErrorResponse(error, { ...context, statusCode, duration }, statusCode, {
        serviceName,
        message: getErrorMessage(error),
      })
    }
  }
}

/**
 * Enhanced try-catch wrapper for async operations
 * Provides consistent error logging in catch blocks
 */
export async function tryCatchWithLogging<T>(
  operation: () => Promise<T>,
  operationName: string,
  context?: Partial<LogContext>
): Promise<{ success: true; data: T } | { success: false; error: unknown; statusCode: number }> {
  const startTime = Date.now()
  const operationLogger = createLogger('operation')
  const fullContext = createLogContext({ operation: operationName, ...context })

  try {
    const data = await operation()
    const duration = Date.now() - startTime

    operationLogger.info(
      `Operation '${operationName}' completed successfully`,
      { ...fullContext, duration }
    )

    return { success: true, data }
  } catch (error) {
    const duration = Date.now() - startTime

    let statusCode = 500
    const errorMsg = getErrorMessage(error).toLowerCase()

    if (
      error instanceof Error &&
      (errorMsg.includes('unauthorized') ||
        errorMsg.includes('forbidden'))
    ) {
      statusCode = 403
    } else if (errorMsg.includes('not found')) {
      statusCode = 404
    } else if (errorMsg.includes('invalid') || errorMsg.includes('validation')) {
      statusCode = 400
    }

    operationLogger.error(
      `Operation '${operationName}' failed`,
      error,
      { ...fullContext, duration, statusCode }
    )

    return { success: false, error, statusCode }
  }
}

/**
 * Validation error helper
 * Logs validation errors with proper context
 */
export function logValidationError(
  error: unknown,
  context: LogContext,
  field?: string
): { status: number; body: Record<string, unknown> } {
  const serviceName = context.route || 'validation'
  const logger = createLogger(serviceName)

  logger.warn(
    `Validation error${field ? ` on field: ${field}` : ''}`,
    error,
    { ...context, validationError: true, field }
  )

  return {
    status: 400,
    body: {
      success: false,
      error: 'Validation failed',
      message: getErrorMessage(error),
      field,
      correlationId: context.correlationId,
    },
  }
}

/**
 * Database error helper
 * Logs database errors without exposing sensitive information
 */
export function logDatabaseError(
  error: unknown,
  operation: string,
  context: LogContext
): { status: number; body: Record<string, unknown> } {
  const logger = createLogger('database')
  const errorMsg = getErrorMessage(error)

  // Log full details server-side
  logger.error(
    `Database operation '${operation}' failed`,
    error,
    { ...context, operation, dbError: true }
  )

  // Return safe error to client
  return {
    status: 500,
    body: {
      success: false,
      error: 'Database operation failed',
      correlationId: context.correlationId,
    },
  }
}
