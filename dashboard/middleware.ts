/**
 * Next.js Middleware for Request-Level Authentication & Rate Limiting
 * Provides defense-in-depth auth protection at the edge
 * Runs on all API requests before route handlers
 *
 * Architecture:
 * 1. Rate limiting check (applied to all routes)
 * 2. Auth verification (applied to protected routes)
 * 3. Request context attachment (headers with user info)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, verifyToken } from './lib/auth'
import { withRateLimit, rateLimiters } from './lib/rate-limiting'

/**
 * Routes that require authentication (user must have valid JWT)
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
 * Routes that are public and don't require authentication
 * Note: /api/health can be protected or public based on security requirements
 */
const PUBLIC_ROUTES = ['/api/health']

/**
 * Authentication routes (public but rate limited)
 * These handle user authentication and token generation
 */
const AUTH_ROUTES = ['/api/auth/login', '/api/auth/verify', '/api/auth']

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Apply rate limiting based on route
  let rateLimitResponse: NextResponse | null = null

  if (pathname.startsWith('/api/auth/login')) {
    rateLimitResponse = await withRateLimit(request, rateLimiters.login)
  } else if (pathname.startsWith('/api/auth/verify')) {
    rateLimitResponse = await withRateLimit(request, rateLimiters.verify)
  } else if (pathname.startsWith('/api/auth')) {
    rateLimitResponse = await withRateLimit(request, rateLimiters.auth)
  } else if (pathname.startsWith('/api/brain')) {
    rateLimitResponse = await withRateLimit(request, rateLimiters.brain)
  } else if (pathname.startsWith('/api/alerts')) {
    rateLimitResponse = await withRateLimit(request, rateLimiters.alerts)
  } else if (pathname.startsWith('/api/conductor')) {
    rateLimitResponse = await withRateLimit(request, rateLimiters.conductor)
  } else if (pathname.startsWith('/api/kanban')) {
    rateLimitResponse = await withRateLimit(request, rateLimiters.kanban)
  } else if (pathname.startsWith('/api/meetings')) {
    rateLimitResponse = await withRateLimit(request, rateLimiters.meetings)
  } else if (pathname.startsWith('/api/metrics')) {
    rateLimitResponse = await withRateLimit(request, rateLimiters.metrics)
  } else if (pathname.startsWith('/api/profiles')) {
    rateLimitResponse = await withRateLimit(request, rateLimiters.profiles)
  }

  // If rate limit exceeded, return 429
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  // Check if route is protected
  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route))
  const isPublic = PUBLIC_ROUTES.some(route => pathname.startsWith(route))
  const isAuth = AUTH_ROUTES.some(route => pathname.startsWith(route))

  // Public and auth routes don't need authentication
  if (isPublic || isAuth) {
    return NextResponse.next()
  }

  if (!isProtected) {
    return NextResponse.next()
  }

  // Verify authentication for protected routes
  const authResult = await verifyAuth(request)

  if (!authResult.authenticated) {
    return NextResponse.json(
      {
        success: false,
        error: authResult.error || 'Unauthorized',
      },
      { status: 401 }
    )
  }

  // Attach user info to request headers for use in route handlers
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', authResult.payload?.sub || '')
  requestHeaders.set('x-user-email', authResult.payload?.email || '')
  requestHeaders.set('x-user-role', authResult.payload?.role || '')

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: ['/api/:path*'],
}
