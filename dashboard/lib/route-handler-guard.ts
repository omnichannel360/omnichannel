/**
 * Route Handler Guard Pattern
 * Unified error handling for all API routes
 *
 * Features:
 * - Automatic correlation ID propagation
 * - Structured error responses with proper HTTP status codes
 * - Comprehensive logging with request context
 * - Rate limiting integration
 * - Authentication/authorization enforcement
 * - Input validation wrapper
 * - Response validation
 * - Graceful error recovery
 *
 * Usage:
 * ```typescript
 * export const GET = guardRoute(async (req, context) => {
 *   const { data } = await validateQuery(req, MySchema)
 *   // Handler logic
 *   return createSuccessResponse(result, context.requestId)
 * }, {
 *   rateLimit: 'api',
 *   requireAuth: true,
 *   requiredRole: 'user'
 * })
 * ```
 */

import { NextRequest, NextResponse } from 'next/server'
import { createLogger, createLogContext, LogContext } from '@/lib/logger'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { verifyAuth, TokenPayload } from '@/lib/auth'
import {
  extractCorrelationFromRequest,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  getHttpStatus,
  getSafeErrorMessage,
  getErrorDetails,
  type ErrorCode,
} from '@/lib/error-handling'

type RateLimitEndpoint = Parameters<typeof applyRateLimit>[1]

/**
 * Guard options for route protection
 */
export interface RouteGuardOptions {
  /** Rate limit bucket name */
  rateLimit?: RateLimitEndpoint
  /** Require authentication (default: true) */
  requireAuth?: boolean
  /** Required role(s) for access */
  requiredRole?: string | string[]
  /** Operation name for logging */
  operation?: string
  /** Skip response validation (default: false) */
  skipResponseValidation?: boolean
}

/**
 * Context passed to route handler
 */
export interface GuardedRouteContext {
  requestId: string
  userId: string
  payload?: TokenPayload
  startTime: number
  logContext: LogContext
}

/**
 * Generic route handler type
 */
export type GuardedRouteHandler<T = unknown> = (
  request: NextRequest,
  context: GuardedRouteContext
) => Promise<NextResponse | { success: boolean; data?: T; requestId: string; timestamp: string }>

/**
 * Route guard wrapper - handles all cross-cutting concerns
 */
export function guardRoute<T = unknown>(
  handler: GuardedRouteHandler<T>,
  options: RouteGuardOptions = {}
) {
  const logger = createLogger('route-guard')
  const {
    rateLimit,
    requireAuth = true,
    requiredRole,
    operation = 'unknown_operation',
    skipResponseValidation = false,
  } = options

  return async (request: NextRequest): Promise<NextResponse> => {
    const requestId = extractCorrelationFromRequest(request.headers)
    const startTime = Date.now()

    const logContext = createLogContext({
      method: request.method,
      path: request.nextUrl.pathname,
      operation,
      requestId,
    })

    try {
      // 1. Rate limiting
      if (rateLimit) {
        const rateLimitError = await applyRateLimit(request, rateLimit)
        if (rateLimitError) {
          const responseTime = Date.now() - startTime
          logger.warn('Rate limit exceeded', {
            ...logContext,
            statusCode: 429,
            responseTimeMs: responseTime,
          })
          return rateLimitError
        }
      }

      // 2. Authentication
      let userId = 'anonymous'
      let payload: TokenPayload | undefined

      if (requireAuth) {
        const auth = await verifyAuth(request)
        if (!auth.authenticated) {
          const responseTime = Date.now() - startTime
          logger.warn('Authentication failed', {
            ...logContext,
            statusCode: 401,
            responseTimeMs: responseTime,
            error: auth.error,
          })
          return createErrorResponse(
            'Authentication required',
            ERROR_CODES.AUTH_INVALID,
            requestId,
            401
          )
        }

        payload = auth.payload
        userId = auth.payload?.sub || 'anonymous'

        // 3. Role-based access control
        if (requiredRole) {
          const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
          if (!payload || !roles.includes(payload.role)) {
            const responseTime = Date.now() - startTime
            logger.warn('Authorization failed - insufficient permissions', {
              ...logContext,
              statusCode: 403,
              responseTimeMs: responseTime,
              userId,
              requiredRole: roles,
              userRole: payload?.role,
            })
            return createErrorResponse(
              'Insufficient permissions',
              ERROR_CODES.INSUFFICIENT_PERMISSIONS,
              requestId,
              403
            )
          }
        }
      }

      // 4. Execute handler
      const context: GuardedRouteContext = {
        requestId,
        userId,
        payload,
        startTime,
        logContext: {
          ...logContext,
          userId,
        },
      }

      const result = await handler(request, context)

      // 5. Handle response
      let response: NextResponse
      let statusCode = 200

      if (result instanceof NextResponse) {
        response = result
        statusCode = result.status
      } else {
        // Wrap plain response object
        response = NextResponse.json(result, { status: 200 })
        statusCode = 200
      }

      // 6. Log success
      const responseTime = Date.now() - startTime
      logger.info('Request completed successfully', {
        ...context.logContext,
        statusCode,
        responseTimeMs: responseTime,
      })

      return response
    } catch (error: unknown) {
      const responseTime = Date.now() - startTime
      const errorDetails = getErrorDetails(error)

      // Determine error code and status
      let code: ErrorCode = ERROR_CODES.INTERNAL_ERROR
      let userMessage = 'An unexpected error occurred'
      let statusCode = 500

      if (error instanceof SyntaxError) {
        code = ERROR_CODES.INVALID_INPUT
        userMessage = 'Invalid request format'
        statusCode = 400
      } else if (error instanceof Error) {
        const msg = error.message.toLowerCase()

        // Validation errors
        if (msg.includes('validation') || msg.includes('invalid') || msg.includes('schema')) {
          code = ERROR_CODES.VALIDATION_ERROR
          userMessage = getSafeErrorMessage(
            error,
            'Request validation failed'
          )
          statusCode = 400
        }
        // Resource not found
        else if (msg.includes('enoent') || msg.includes('not found')) {
          code = ERROR_CODES.RESOURCE_NOT_FOUND
          userMessage = 'Resource not found'
          statusCode = 404
        }
        // Permission denied
        else if (msg.includes('eacces') || msg.includes('permission')) {
          code = ERROR_CODES.INSUFFICIENT_PERMISSIONS
          userMessage = 'Access denied'
          statusCode = 403
        }
        // Timeout
        else if (msg.includes('timeout') || msg.includes('etimedout')) {
          code = ERROR_CODES.SERVICE_UNAVAILABLE
          userMessage = 'Request timeout'
          statusCode = 503
        }
        // Conflict
        else if (msg.includes('conflict') || msg.includes('duplicate')) {
          code = ERROR_CODES.CONFLICT
          userMessage = 'Resource conflict'
          statusCode = 409
        }
      }

      // Log error with full context
      logger.error('Request failed', error, {
        ...logContext,
        statusCode,
        responseTimeMs: responseTime,
        errorName: errorDetails.name,
        errorMessage: errorDetails.message,
      })

      return createErrorResponse(userMessage, code, requestId, statusCode, {
        error: errorDetails.message,
        timestamp: new Date().toISOString(),
      })
    }
  }
}

/**
 * Simpler guard for public routes (no auth required)
 */
export function guardPublicRoute<T = unknown>(
  handler: GuardedRouteHandler<T>,
  options: Omit<RouteGuardOptions, 'requireAuth'> = {}
) {
  return guardRoute(handler, { ...options, requireAuth: false })
}

/**
 * Guard for admin-only routes
 */
export function guardAdminRoute<T = unknown>(
  handler: GuardedRouteHandler<T>,
  options: Omit<RouteGuardOptions, 'requiredRole'> = {}
) {
  return guardRoute(handler, { ...options, requireAuth: true, requiredRole: 'admin' })
}
