import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from './lib/auth'

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/api/alerts',
  '/api/brain',
  '/api/conductor',
  '/api/kanban',
  '/api/meetings',
  '/api/metrics',
  '/api/profiles',
]

// Routes that are public (health check, etc.)
const PUBLIC_ROUTES = ['/api/health']

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Check if route is protected
  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route))
  const isPublic = PUBLIC_ROUTES.some(route => pathname.startsWith(route))

  if (!isProtected || isPublic) {
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
      { status: authResult.status }
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
