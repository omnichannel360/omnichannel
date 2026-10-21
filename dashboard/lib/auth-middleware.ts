/**
 * Centralized Auth Middleware for API Routes
 * Provides reusable auth protection with role-based access control
 * Consistent error handling and audit logging
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, TokenPayload, AuthErrors } from '@/lib/auth'
import { logger, createLogContext } from '@/lib/logger'

export interface AuthContext {
  authenticated: boolean
  payload?: TokenPayload
  error?: string
  userId?: string
  email?: string
  role?: string
}

export interface AuthMiddlewareOptions {
  requireAuth?: boolean
  allowedRoles?: string[]
  auditLog?: boolean
}

/**
 * Extract auth context from request
 * Returns auth status with token payload or error
 */
export async function getAuthContext(request: NextRequest): Promise<AuthContext> {
  try {
    const token = await verifyToken(request)

    if (!token) {
      return {
        authenticated: false,
        error: AuthErrors.MISSING_TOKEN.message,
      }
    }

    return {
      authenticated: true,
      payload: token,
      userId: token.sub,
      email: token.email,
      role: token.role,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token verification failed'
    return {
      authenticated: false,
      error: message,
    }
  }
}

/**
 * Verify authentication and optional role-based access
 * Returns auth context or error response
 */
export async function verifyAuthMiddleware(
  request: NextRequest,
  options: AuthMiddlewareOptions = {}
): Promise<AuthContext | NextResponse> {
  const { requireAuth = true, allowedRoles = [], auditLog = true } = options

  const authContext = await getAuthContext(request)

  // Log authentication attempts if enabled
  if (auditLog) {
    const logContext = createLogContext({
      method: request.method,
      path: request.nextUrl.pathname,
      authenticated: authContext.authenticated,
      userId: authContext.userId,
      role: authContext.role,
    })

    if (authContext.authenticated) {
      logger.info('Auth middleware: authenticated request', logContext)
    } else {
      logger.warn('Auth middleware: unauthenticated request', {
        ...logContext,
        error: authContext.error,
      })
    }
  }

  // If auth is not required, allow public access
  if (!requireAuth) {
    return authContext
  }

  // If auth is required but missing/invalid, return 401
  if (!authContext.authenticated) {
    return NextResponse.json(
      {
        success: false,
        error: authContext.error || AuthErrors.MISSING_TOKEN.message,
      },
      { status: AuthErrors.MISSING_TOKEN.status }
    )
  }

  // Check role-based access control
  if (allowedRoles.length > 0 && authContext.role) {
    if (!allowedRoles.includes(authContext.role)) {
      logger.warn('Auth middleware: insufficient permissions', {
        method: request.method,
        path: request.nextUrl.pathname,
        userId: authContext.userId,
        requiredRoles: allowedRoles,
        userRole: authContext.role,
      })

      return NextResponse.json(
        {
          success: false,
          error: AuthErrors.FORBIDDEN.message,
        },
        { status: AuthErrors.FORBIDDEN.status }
      )
    }
  }

  return authContext
}

/**
 * Higher-order function to wrap API handlers with auth middleware
 * Usage: export const POST = withAuth(myHandler, { allowedRoles: ['admin'] })
 */
export function withAuth<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
  options: AuthMiddlewareOptions = {}
): (...args: any[]) => Promise<Response> {
  return async (request: NextRequest, ...args: any[]) => {
    const authResult = await verifyAuthMiddleware(request, options)

    // If auth failed, authResult is a NextResponse
    if (authResult instanceof NextResponse) {
      return authResult
    }

    // Attach auth context to request for use in handler
    const requestWithAuth = request as any
    requestWithAuth.auth = authResult

    try {
      return await handler(request, ...args)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      logger.error('Auth middleware handler error', error, {
        path: request.nextUrl.pathname,
        method: request.method,
        userId: authResult.userId,
      })

      return NextResponse.json(
        {
          success: false,
          error: message,
        },
        { status: 500 }
      )
    }
  }
}

/**
 * Extract auth context from request headers
 * Used to retrieve auth data injected by Next.js middleware
 */
export function extractAuthFromHeaders(request: NextRequest): AuthContext {
  const userId = request.headers.get('x-user-id')
  const email = request.headers.get('x-user-email')
  const role = request.headers.get('x-user-role')

  if (!userId) {
    return {
      authenticated: false,
      error: 'Missing authentication headers',
    }
  }

  return {
    authenticated: true,
    userId,
    email: email || undefined,
    role: role || undefined,
  }
}

/**
 * Audit log an authentication event
 */
export function auditAuthEvent(
  event: 'login' | 'logout' | 'token_refresh' | 'unauthorized_access' | 'permission_denied',
  context: {
    userId?: string
    email?: string
    path?: string
    method?: string
    error?: string
  }
): void {
  logger.info(`Auth audit: ${event}`, {
    timestamp: new Date().toISOString(),
    ...context,
  })
}
