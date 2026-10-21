/**
 * Centralized Auth Middleware
 * Provides decorator/wrapper pattern for protecting API endpoints
 * Ensures consistent auth validation across all routes
 *
 * Features:
 * - Correlation ID propagation
 * - Structured error responses
 * - Comprehensive logging with context
 * - Role-based access control (RBAC)
 *
 * Usage:
 * export const GET = withAuth(async (request, auth) => { ... })
 * export const POST = withAuth(handler, { requiredRole: 'admin' })
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, createUnauthorizedResponse, TokenPayload } from '@/lib/auth'
import { createLogger, createLogContext, LogContext } from '@/lib/logger'
import {
  getOrCreateCorrelationId,
  createErrorResponse,
  ERROR_CODES,
  formatErrorLog,
} from '@/lib/error-handling'

const logger = createLogger('auth-middleware')

export interface AuthenticatedRequest extends NextRequest {
  auth?: {
    authenticated: boolean
    payload?: TokenPayload
    error?: string
  }
}

export interface AuthMiddlewareOptions {
  /** Endpoints that don't require auth (relative paths) */
  publicEndpoints?: string[]
  /** Role-based access control requirements */
  requiredRole?: string | string[]
  /** Custom error message */
  errorMessage?: string
}

/**
 * HTTP method type
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

/**
 * Verify auth and return auth context
 * Logs unauthorized attempts with correlation ID
 */
export async function requireAuth(
  request: NextRequest,
  correlationId: string
): Promise<{
  authenticated: boolean
  payload?: TokenPayload
  error?: string
  response?: NextResponse
}> {
  try {
    const auth = await verifyAuth(request)

    if (!auth.authenticated) {
      const logContext = createLogContext({
        method: request.method,
        path: request.nextUrl.pathname,
        operation: 'auth_verification_failed',
      })

      logger.warn(
        'Unauthorized access attempt',
        formatErrorLog('Authentication verification failed', new Error(auth.error || 'Unknown error'), {
          requestId: correlationId,
          ...logContext,
          statusCode: 401,
        })
      )

      return {
        authenticated: false,
        error: auth.error || 'Authentication required',
        response: createErrorResponse(
          'Authentication required',
          ERROR_CODES.AUTH_INVALID,
          correlationId,
          401
        ),
      }
    }

    return {
      authenticated: true,
      payload: auth.payload,
    }
  } catch (error) {
    logger.error(
      'Auth verification error',
      error,
      formatErrorLog('Auth verification threw error', error, {
        requestId: correlationId,
        method: request.method,
        path: request.nextUrl.pathname,
      })
    )

    return {
      authenticated: false,
      error: 'Authentication verification failed',
      response: createErrorResponse(
        'Authentication verification failed',
        ERROR_CODES.AUTH_INVALID,
        correlationId,
        401
      ),
    }
  }
}

/**
 * Check role-based access control
 */
export function checkRole(
  payload: TokenPayload | undefined,
  requiredRole: string | string[] | undefined
): { allowed: boolean; error?: string } {
  if (!requiredRole) return { allowed: true }

  if (!payload) {
    return { allowed: false, error: 'Missing token payload' }
  }

  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]

  if (!roles.includes(payload.role)) {
    return {
      allowed: false,
      error: `Insufficient permissions. Required role: ${roles.join(' or ')}`,
    }
  }

  return { allowed: true }
}

/**
 * Higher-order function to wrap API route handlers with auth middleware
 *
 * @example
 * ```typescript
 * export const GET = withAuth(async (request, auth) => {
 *   // Your handler code
 *   return NextResponse.json({ data: 'protected' })
 * })
 *
 * export const POST = withAuth(async (request, auth) => {
 *   // Your handler code
 * }, { requiredRole: 'admin' })
 * ```
 */
export function withAuth<T extends NextRequest>(
  handler: (request: T, auth: { payload: TokenPayload; userId: string; correlationId: string }) => Promise<NextResponse>,
  options: AuthMiddlewareOptions = {}
) {
  return async (request: T): Promise<NextResponse> => {
    // Extract or generate correlation ID
    const correlationId = getOrCreateCorrelationId(request.headers.get('x-correlation-id'))

    try {
      // Check if endpoint is public
      if (options.publicEndpoints?.includes(request.nextUrl.pathname)) {
        return handler(request, {
          payload: {} as TokenPayload,
          userId: 'anonymous',
          correlationId,
        })
      }

      // Verify authentication
      const auth = await requireAuth(request, correlationId)
      if (!auth.authenticated) {
        return auth.response!
      }

      // Check role-based access control
      if (options.requiredRole) {
        const roleCheck = checkRole(auth.payload, options.requiredRole)
        if (!roleCheck.allowed) {
          logger.warn(
            'Access denied - insufficient permissions',
            formatErrorLog('Role check failed', new Error(roleCheck.error || 'Unknown error'), {
              requestId: correlationId,
              method: request.method,
              path: request.nextUrl.pathname,
              userId: auth.payload?.sub,
              requiredRole: options.requiredRole,
              userRole: auth.payload?.role,
            })
          )

          return createErrorResponse(
            roleCheck.error || 'Insufficient permissions',
            ERROR_CODES.INSUFFICIENT_PERMISSIONS,
            correlationId,
            403
          )
        }
      }

      // Call handler with authenticated context
      return handler(request, {
        payload: auth.payload!,
        userId: auth.payload?.sub || '',
        correlationId,
      })
    } catch (error) {
      logger.error(
        'Auth middleware error',
        error,
        formatErrorLog('Unhandled error in auth middleware', error, {
          requestId: correlationId,
          method: request.method,
          path: request.nextUrl.pathname,
        })
      )

      return createErrorResponse(
        'Authentication failed',
        ERROR_CODES.AUTH_INVALID,
        correlationId,
        401
      )
    }
  }
}

/**
 * Middleware for validating auth on middleware.ts level
 * Used as part of request-level auth (before route handlers)
 */
export async function validateRequestAuth(request: NextRequest): Promise<{
  authenticated: boolean
  error?: string
}> {
  const auth = await verifyAuth(request)
  return {
    authenticated: auth.authenticated,
    error: auth.error,
  }
}
