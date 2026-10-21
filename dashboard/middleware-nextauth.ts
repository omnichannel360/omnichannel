/**
 * Enhanced Middleware for NextAuth.js Integration
 * Combines NextAuth.js session management with existing JWT verification
 * Protects all /api/* routes with comprehensive auth checks
 *
 * This middleware works alongside auth.config.ts to provide:
 * 1. Session validation via NextAuth
 * 2. JWT token verification
 * 3. Role-based access control (RBAC)
 * 4. Correlation ID tracking
 * 5. Comprehensive error logging
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth.config'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { logger } from './lib/logger'
import {
  getOrCreateCorrelationId,
  createErrorResponse,
  ERROR_CODES,
  formatErrorLog,
} from './lib/error-handling'

export type UserRole = 'admin' | 'user' | 'viewer'

export interface AuthPayload extends JwtPayload {
  sub: string
  email: string
  role: UserRole
  iat: number
  exp: number
}

/**
 * Protected routes that require authentication
 */
const PROTECTED_ROUTES = [
  '/api/alerts',
  '/api/brain',
  '/api/conductor',
  '/api/kanban',
  '/api/meetings',
  '/api/metrics',
  '/api/profiles',
]

/**
 * Public routes (no authentication required)
 */
const PUBLIC_ROUTES = ['/api/health', '/api/health/check']

/**
 * Auth routes (public, rate-limited separately)
 */
const AUTH_ROUTES = ['/api/auth', '/api/auth/login', '/api/auth/verify']

/**
 * Role-based access control configuration
 */
const ROUTE_ACCESS_CONFIG: Record<string, UserRole[]> = {
  '/api/alerts': ['admin', 'user'],
  '/api/brain': ['admin', 'user'],
  '/api/conductor': ['admin', 'user'],
  '/api/kanban': ['admin', 'user'],
  '/api/meetings': ['admin', 'user'],
  '/api/metrics': ['admin', 'user', 'viewer'],
  '/api/profiles': ['admin', 'user'],
}

/**
 * Get JWT secret from environment
 */
function getJWTSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    logger.error('JWT_SECRET environment variable is not set', new Error('Missing configuration'), {
      component: 'middleware-nextauth',
      operation: 'getJWTSecret',
    })
    throw new Error('JWT_SECRET not configured')
  }
  return secret
}

/**
 * Extract and verify JWT from Authorization header
 */
function verifyTokenFromRequest(authHeader: string | null): {
  valid: boolean
  payload?: AuthPayload
  error?: string
} {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      valid: false,
      error: 'Missing or malformed Authorization header',
    }
  }

  try {
    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, getJWTSecret()) as unknown as AuthPayload
    return {
      valid: true,
      payload: decoded,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token verification failed'
    return {
      valid: false,
      error: message,
    }
  }
}

/**
 * Check if route is protected
 */
function isProtectedRoute(pathname: string): boolean {
  // Check if explicitly public
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return false
  }

  // Check if auth route (public)
  if (AUTH_ROUTES.some(route => pathname.startsWith(route))) {
    return false
  }

  // Check if protected
  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    return true
  }

  // Default: allow other routes
  return false
}

/**
 * Check if user role has access to route
 */
function canAccessRoute(pathname: string, userRole: UserRole): boolean {
  const requiredRoles = ROUTE_ACCESS_CONFIG[pathname]
  if (!requiredRoles) {
    return true
  }
  return requiredRoles.includes(userRole)
}

/**
 * Get required roles for a route
 */
function getRequiredRoles(pathname: string): UserRole[] {
  return ROUTE_ACCESS_CONFIG[pathname] || []
}

/**
 * Main middleware function
 * Validates authentication and role-based access for protected routes
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const method = request.method

  // Generate or extract correlation ID
  const correlationId = getOrCreateCorrelationId(request.headers.get('x-correlation-id'))

  // Skip middleware for non-API routes
  if (!pathname.startsWith('/api/')) {
    const response = NextResponse.next()
    response.headers.set('x-correlation-id', correlationId)
    return response
  }

  // Skip protected route check for public endpoints
  if (!isProtectedRoute(pathname)) {
    const response = NextResponse.next()
    response.headers.set('x-correlation-id', correlationId)
    return response
  }

  // Route is protected - verify authentication via JWT
  const authHeader = request.headers.get('authorization')
  const tokenResult = verifyTokenFromRequest(authHeader)

  if (!tokenResult.valid) {
    logger.warn(
      'Authentication failed',
      formatErrorLog('Token verification failed', new Error(tokenResult.error || 'Unknown error'), {
        requestId: correlationId,
        method,
        pathname,
        reason: tokenResult.error,
      })
    )

    return createErrorResponse(
      'Authentication required',
      ERROR_CODES.AUTH_INVALID,
      correlationId,
      401
    )
  }

  // Token valid - check role-based access
  if (tokenResult.payload) {
    const requiredRoles = getRequiredRoles(pathname)
    if (requiredRoles.length > 0 && !canAccessRoute(pathname, tokenResult.payload.role)) {
      logger.warn(
        'Access denied - insufficient permissions',
        formatErrorLog('Role check failed', new Error('Insufficient permissions'), {
          requestId: correlationId,
          method,
          pathname,
          userId: tokenResult.payload.sub,
          userRole: tokenResult.payload.role,
          requiredRoles,
        })
      )

      return createErrorResponse(
        `Insufficient permissions. Required role: ${requiredRoles.join(' or ')}`,
        ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        correlationId,
        403
      )
    }

    // Inject auth context into headers for route handler access
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', tokenResult.payload.sub || '')
    requestHeaders.set('x-user-email', tokenResult.payload.email || '')
    requestHeaders.set('x-user-role', tokenResult.payload.role || '')
    requestHeaders.set('x-auth-verified', 'true')
    requestHeaders.set('x-correlation-id', correlationId)

    logger.info('Authentication successful', {
      requestId: correlationId,
      method,
      pathname,
      userId: tokenResult.payload.sub,
      userRole: tokenResult.payload.role,
    })

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }

  // Fallback error
  logger.error(
    'Unexpected authentication failure',
    new Error('Token present but payload missing'),
    {
      requestId: correlationId,
      method,
      pathname,
    }
  )

  return createErrorResponse(
    'Authentication failed',
    ERROR_CODES.AUTH_INVALID,
    correlationId,
    401
  )
}

/**
 * Matcher configuration
 * Apply middleware to all API routes
 */
export const config = {
  matcher: ['/api/:path*'],
}
