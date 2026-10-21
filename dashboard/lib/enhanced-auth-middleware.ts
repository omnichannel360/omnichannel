/**
 * Enhanced Auth Middleware
 * Comprehensive authentication and authorization for all API endpoints
 * Features:
 * - Centralized route configuration
 * - Consistent error handling
 * - Role-based access control
 * - Audit logging
 * - Rate limiting integration
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, TokenPayload, AuthErrors } from '@/lib/auth'
import { logger, createLogContext } from '@/lib/logger'
import { getRouteConfig, isProtectedRoute } from '@/lib/auth-config'

export interface EnhancedAuthContext {
  authenticated: boolean
  payload?: TokenPayload
  userId?: string
  email?: string
  role?: string
  error?: string
  code?: string
}

export interface EnhancedAuthOptions {
  auditLog?: boolean
  includeHeaders?: boolean
}

/**
 * Core auth verification function
 * Extracts and validates token from request
 */
export async function verifyEnhancedAuth(
  request: NextRequest
): Promise<EnhancedAuthContext> {
  try {
    const token = await verifyToken(request)

    if (!token) {
      return {
        authenticated: false,
        error: AuthErrors.MISSING_TOKEN.message,
        code: 'MISSING_TOKEN',
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
      code: 'INVALID_TOKEN',
    }
  }
}

/**
 * Apply auth middleware to request
 * Checks authentication based on route configuration
 * Returns auth context or error response
 */
export async function applyAuthMiddleware(
  request: NextRequest,
  options: EnhancedAuthOptions = {}
): Promise<EnhancedAuthContext | NextResponse> {
  const { auditLog = true, includeHeaders = true } = options
  const pathname = request.nextUrl.pathname

  // Get route configuration
  const routeConfig = getRouteConfig(pathname)

  // If route doesn't require auth, return success
  if (!routeConfig.requireAuth) {
    return {
      authenticated: true,
      error: undefined,
    }
  }

  // Verify authentication
  const authContext = await verifyEnhancedAuth(request)

  // Log authentication attempt if enabled
  if (auditLog) {
    const logContext = createLogContext({
      method: request.method,
      path: pathname,
      authenticated: authContext.authenticated,
      userId: authContext.userId,
      role: authContext.role,
      code: authContext.code,
    })

    if (authContext.authenticated) {
      logger.info('Auth middleware: authenticated request', logContext)
    } else {
      logger.warn('Auth middleware: authentication failed', {
        ...logContext,
        error: authContext.error,
      })
    }
  }

  // If auth failed, return 401
  if (!authContext.authenticated) {
    return NextResponse.json(
      {
        success: false,
        error: authContext.error || AuthErrors.MISSING_TOKEN.message,
        code: authContext.code || 'UNAUTHORIZED',
      },
      { status: 401 }
    )
  }

  // Check role-based access control
  const requiredRoles = routeConfig.allowedRoles || []
  if (requiredRoles.length > 0 && authContext.role) {
    if (!requiredRoles.includes(authContext.role)) {
      if (auditLog) {
        logger.warn('Auth middleware: insufficient permissions', {
          method: request.method,
          path: pathname,
          userId: authContext.userId,
          requiredRoles,
          userRole: authContext.role,
        })
      }

      return NextResponse.json(
        {
          success: false,
          error: AuthErrors.FORBIDDEN.message,
          code: 'FORBIDDEN',
        },
        { status: 403 }
      )
    }
  }

  return authContext
}

/**
 * Middleware for Next.js route handlers
 * Wrap handler to enforce auth before execution
 *
 * DEPRECATION NOTICE: Use protectRoute() from protected-route.ts instead.
 * This function uses unsafe type casting. The protectRoute() function provides
 * a properly typed alternative that passes auth context as a separate argument.
 */
export function withEnhancedAuth<T extends (...args: unknown[]) => Promise<Response>>(
  handler: T,
  options: EnhancedAuthOptions = {}
): (...args: unknown[]) => Promise<Response> {
  return async (request: NextRequest, ...args: unknown[]) => {
    const authResult = await applyAuthMiddleware(request, options)

    // If auth failed, return error response
    if (authResult instanceof NextResponse) {
      return authResult
    }

    try {
      // Pass auth context as middleware context via request headers
      // This allows the handler to access auth without casting
      const requestWithHeaders = request.clone()
      if (authResult.userId) {
        requestWithHeaders.headers.set('x-user-id', authResult.userId)
      }
      if (authResult.email) {
        requestWithHeaders.headers.set('x-user-email', authResult.email)
      }
      if (authResult.role) {
        requestWithHeaders.headers.set('x-user-role', authResult.role)
      }

      return await handler(requestWithHeaders, ...args)
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
          code: 'HANDLER_ERROR',
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
export function extractEnhancedAuthFromHeaders(request: NextRequest): EnhancedAuthContext {
  const userId = request.headers.get('x-user-id')
  const email = request.headers.get('x-user-email')
  const role = request.headers.get('x-user-role')

  if (!userId) {
    return {
      authenticated: false,
      error: 'Missing authentication headers',
      code: 'MISSING_HEADERS',
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
 * Create typed response wrapper
 * Provides consistent error and success responses
 */
export function createAuthErrorResponse(
  error: string,
  code: string,
  status: number
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error,
      code,
    },
    { status }
  )
}

/**
 * Helper to get auth context from request in handlers
 * Usage: const auth = getAuthFromRequest(request)
 */
export function getAuthFromRequest(request: NextRequest): EnhancedAuthContext {
  // Extract auth context from request headers (set by middleware)
  return extractEnhancedAuthFromHeaders(request)
}
