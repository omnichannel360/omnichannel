/**
 * Async Route Wrapper
 * Wraps async route handlers with automatic error handling and logging
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger, getErrorMessage, LogContext } from '@/lib/logger'
import { getOrCreateCorrelationId, extractRequestContext } from '@/lib/middleware/error-context'

export type RouteHandler = (request: NextRequest) => Promise<NextResponse>

/**
 * HTTP method type
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

/**
 * Options for route wrapping
 */
export interface AsyncRouteOptions {
  /**
   * Operation name for logging
   */
  operationName: string

  /**
   * HTTP method (GET, POST, etc.)
   */
  method: HttpMethod

  /**
   * Whether to log the request body (avoid for sensitive data)
   */
  logRequestBody?: boolean

  /**
   * Custom error response formatter
   */
  errorFormatter?: (error: unknown, context: LogContext) => {
    message: string
    statusCode: number
    details?: Record<string, unknown>
  }

  /**
   * Additional context to attach to logs
   */
  context?: Partial<LogContext>
}

/**
 * Default error response formatter
 */
function defaultErrorFormatter(
  error: unknown,
  context: LogContext
): {
  message: string
  statusCode: number
  details?: Record<string, unknown>
} {
  if (error instanceof SyntaxError && 'body' in error) {
    return {
      message: 'Invalid JSON in request body',
      statusCode: 400,
      details: { type: 'INVALID_JSON' }
    }
  }

  if (error instanceof TypeError) {
    return {
      message: 'Invalid request data',
      statusCode: 400,
      details: { type: 'TYPE_ERROR' }
    }
  }

  return {
    message: 'Internal server error',
    statusCode: 500,
    details: { type: 'INTERNAL_ERROR' }
  }
}

/**
 * Wrap an async route handler with automatic error handling and logging
 */
export function asyncRoute(
  handler: RouteHandler,
  options: AsyncRouteOptions
): RouteHandler {
  return async (request: NextRequest): Promise<NextResponse> => {
    const correlationId = getOrCreateCorrelationId(request)
    const startTime = Date.now()
    const context = extractRequestContext(request)

    const fullContext: LogContext = {
      ...context,
      ...options.context,
      correlationId,
      operation: options.operationName,
      method: options.method
    }

    try {
      logger.debug(`Starting ${options.operationName}`, fullContext, {
        url: request.nextUrl.pathname,
        ...(options.logRequestBody && { hasBody: request.body !== null })
      })

      const response = await handler(request)
      const duration = Date.now() - startTime

      logger.logOperation(options.operationName, duration, true, {
        ...fullContext,
        statusCode: response.status
      })

      // Add correlation ID to response
      response.headers.set('x-correlation-id', correlationId)
      response.headers.set('x-operation', options.operationName)

      return response
    } catch (error) {
      const duration = Date.now() - startTime
      const errorFormatter = options.errorFormatter || defaultErrorFormatter

      logger.error(
        `${options.operationName} failed`,
        error,
        {
          ...fullContext,
          duration
        }
      )

      const { message, statusCode, details } = errorFormatter(error, fullContext)

      return NextResponse.json(
        {
          success: false,
          error: message,
          ...(details && { details }),
          correlationId
        },
        {
          status: statusCode,
          headers: {
            'x-correlation-id': correlationId,
            'x-operation': options.operationName
          }
        }
      )
    }
  }
}

/**
 * Factory functions for common HTTP methods
 */
export const asyncGet = (handler: RouteHandler, options: Omit<AsyncRouteOptions, 'method'>) =>
  asyncRoute(handler, { ...options, method: 'GET' })

export const asyncPost = (handler: RouteHandler, options: Omit<AsyncRouteOptions, 'method'>) =>
  asyncRoute(handler, { ...options, method: 'POST' })

export const asyncPut = (handler: RouteHandler, options: Omit<AsyncRouteOptions, 'method'>) =>
  asyncRoute(handler, { ...options, method: 'PUT' })

export const asyncPatch = (handler: RouteHandler, options: Omit<AsyncRouteOptions, 'method'>) =>
  asyncRoute(handler, { ...options, method: 'PATCH' })

export const asyncDelete = (handler: RouteHandler, options: Omit<AsyncRouteOptions, 'method'>) =>
  asyncRoute(handler, { ...options, method: 'DELETE' })

/**
 * Combine multiple middleware with async route
 */
export async function withMiddleware(
  request: NextRequest,
  handler: RouteHandler,
  middleware: Array<(req: NextRequest, next: RouteHandler) => Promise<NextResponse>>
): Promise<NextResponse> {
  let currentHandler = handler

  // Build middleware chain
  for (let i = middleware.length - 1; i >= 0; i--) {
    const mw = middleware[i]
    const nextHandler = currentHandler
    currentHandler = (req: NextRequest) => mw(req, nextHandler)
  }

  return currentHandler(request)
}
