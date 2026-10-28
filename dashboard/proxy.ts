/**
 * Next.js Middleware for Request-Level Authentication
 * Protects all API endpoints except public routes (auth, health)
 * Runs on all API requests before route handlers
 *
 * Architecture:
 * 1. Route classification (protected vs public)
 * 2. Token verification for protected routes
 * 3. Role-based access control (RBAC)
 * 4. Auth context injection via headers
 * 5. Comprehensive error logging
 * 6. Minimal performance impact - early return for public routes
 *
 * Note: Rate limiting is handled per-route in middleware, not here
 */

import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify, type JWTPayload } from 'jose'
import { logger } from './lib/logger'
import {
  getOrCreateCorrelationId,
  createErrorResponse,
  ERROR_CODES,
  formatErrorLog,
} from './lib/error-handling'

/**
 * Routes that require authentication (user must have valid JWT)
 * All other /api/* routes not listed here are assumed public
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
 * Routes that are explicitly public (no authentication required)
 */
const PUBLIC_ROUTES = [
  '/api/health',
  '/api/health/check',
]

/**
 * Authentication routes (public, rate-limited separately)
 */
const AUTH_ROUTES = [
  '/api/auth',
  '/api/auth/login',
  '/api/auth/verify',
]

export type UserRole = 'admin' | 'user' | 'viewer'

const VALID_ROLES: readonly UserRole[] = ['admin', 'user', 'viewer']

/**
 * Identity headers only the middleware may set. Any client-supplied value is
 * dropped on every request so handlers can never trust a spoofed identity.
 */
const IDENTITY_HEADERS = ['x-user-id', 'x-user-email', 'x-user-role', 'x-auth-verified'] as const

export const SESSION_COOKIE = 'oc_session'

const PUBLIC_PAGES = ['/login']

export interface AuthPayload extends JWTPayload {
  sub: string
  email: string
  role: UserRole
  iat: number
  exp: number
}

/**
 * Route access configuration
 * Specifies which roles can access which routes
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
 * CRITICAL: Must be set in production
 */
function getJWTSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    logger.error('JWT_SECRET environment variable is not set', new Error('Missing configuration'), {
      component: 'middleware',
      operation: 'getJWTSecret',
    })
    throw new Error('JWT_SECRET not configured')
  }
  return secret
}

/**
 * Token from Authorization header, falling back to the session cookie (browser UI).
 */
function extractToken(request: NextRequest): { token?: string; fromCookie: boolean } {
  const authHeader = request.headers.get('authorization')
  // RFC 7235 §2.1: auth-scheme is case-insensitive
  const match = authHeader?.match(/^Bearer\s+(\S+)$/i)
  if (match) {
    return { token: match[1], fromCookie: false }
  }
  const cookie = request.cookies.get(SESSION_COOKIE)?.value
  return { token: cookie || undefined, fromCookie: Boolean(cookie) }
}

/**
 * Verify JWT with jose: jsonwebtoken relies on Node crypto and fails in the Edge runtime.
 */
async function verifyToken(token: string | undefined): Promise<{
  valid: boolean
  payload?: AuthPayload
  error?: string
}> {
  if (!token) {
    return {
      valid: false,
      error: 'Missing or malformed Authorization header',
    }
  }

  try {
    const secret = new TextEncoder().encode(getJWTSecret())
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    // Refresh tokens only mint new access tokens; they never authorize requests or sessions
    if (payload.type === 'refresh') {
      return { valid: false, error: 'Refresh token cannot be used for access' }
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return { valid: false, error: 'Token missing subject' }
    }
    if (typeof payload.role !== 'string' || !VALID_ROLES.includes(payload.role as UserRole)) {
      return { valid: false, error: 'Token missing or has unknown role' }
    }
    return {
      valid: true,
      payload: payload as AuthPayload,
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
 * Determine if a route requires authentication
 */
function isProtectedRoute(pathname: string): boolean {
  // Check if explicitly public
  if (PUBLIC_ROUTES.some(route => matchesRoute(pathname, route))) {
    return false
  }

  // Check if auth route (public)
  if (AUTH_ROUTES.some(route => matchesRoute(pathname, route))) {
    return false
  }

  // Check if protected
  if (PROTECTED_ROUTES.some(route => matchesRoute(pathname, route))) {
    return true
  }

  // Default: allow other routes (not an API route we manage)
  return false
}

/**
 * Match a route and its sub-paths on a segment boundary
 * ('/api/alerts' matches '/api/alerts' and '/api/alerts/1', not '/api/alertsx')
 */
function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

/**
 * Get required roles for a route, including its sub-paths
 */
function getRequiredRoles(pathname: string): UserRole[] {
  const route = Object.keys(ROUTE_ACCESS_CONFIG).find(r => matchesRoute(pathname, r))
  return route ? ROUTE_ACCESS_CONFIG[route] : []
}

/**
 * Check if user role has access to route
 */
function canAccessRoute(pathname: string, userRole: UserRole): boolean {
  const requiredRoles = getRequiredRoles(pathname)
  if (requiredRoles.length === 0) {
    return true // No specific role requirement
  }
  return requiredRoles.includes(userRole)
}

/**
 * Decode percent-encoding and collapse repeated slashes; null when the encoding is malformed
 */
function normalizePathname(rawPathname: string): string | null {
  try {
    return decodeURIComponent(rawPathname).replace(/\/{2,}/g, '/')
  } catch {
    return null
  }
}

/**
 * Copy of the request headers with all client-supplied identity headers removed
 */
function withoutIdentityHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers)
  for (const name of IDENTITY_HEADERS) {
    headers.delete(name)
  }
  return headers
}

/**
 * Main middleware function
 * Validates authentication and role-based access for protected routes
 * Attaches user context to request headers for handlers
 *
 * Architecture:
 * 1. Generate/extract correlation ID
 * 2. Skip middleware for non-API routes
 * 3. Skip for public endpoints
 * 4. Verify authentication token
 * 5. Check role-based access control
 * 6. Inject auth context into headers
 */
export async function middleware(request: NextRequest) {
  const method = request.method

  // Generate or extract correlation ID for request tracing
  const correlationId = getOrCreateCorrelationId(request.headers.get('x-correlation-id'))

  // Classify on the decoded, canonical path so encodings like /api/%61lerts or /api//alerts
  // cannot slip past route checks that the router would still resolve to /api/alerts
  const pathname = normalizePathname(request.nextUrl.pathname)
  if (pathname === null) {
    return createErrorResponse('Malformed request path', ERROR_CODES.INVALID_INPUT, correlationId, 400)
  }

  // Dashboard pages: require a valid session cookie, otherwise send to /login
  if (!pathname.startsWith('/api/')) {
    if (!PUBLIC_PAGES.includes(pathname)) {
      const session = await verifyToken(request.cookies.get(SESSION_COOKIE)?.value)
      if (!session.valid) {
        const loginUrl = new URL('/login', request.url)
        if (pathname !== '/') loginUrl.searchParams.set('next', pathname)
        return NextResponse.redirect(loginUrl)
      }
    }
    const response = NextResponse.next({ request: { headers: withoutIdentityHeaders(request) } })
    response.headers.set('x-correlation-id', correlationId)
    return response
  }

  // Skip protected route check for public endpoints, but never forward a spoofed identity
  if (!isProtectedRoute(pathname)) {
    const response = NextResponse.next({ request: { headers: withoutIdentityHeaders(request) } })
    response.headers.set('x-correlation-id', correlationId)
    return response
  }

  // Route is protected - verify authentication
  const { token, fromCookie } = extractToken(request)
  const tokenResult = await verifyToken(token)

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
    const requestHeaders = withoutIdentityHeaders(request)
    requestHeaders.set('x-user-id', tokenResult.payload.sub || '')
    requestHeaders.set('x-user-email', tokenResult.payload.email || '')
    requestHeaders.set('x-user-role', tokenResult.payload.role || '')
    requestHeaders.set('x-auth-verified', 'true')
    requestHeaders.set('x-correlation-id', correlationId)
    // Route handlers re-verify via the Authorization header; forward cookie sessions as Bearer
    if (fromCookie && token) {
      requestHeaders.set('authorization', `Bearer ${token}`)
    }

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

  // Fallback error (should not reach here)
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js)$).*)'],
}
