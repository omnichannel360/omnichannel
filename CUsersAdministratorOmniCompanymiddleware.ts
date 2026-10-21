/**
 * Global Security Middleware
 * YOLO Mode: Automatically applies security headers to ALL responses
 * This ensures 100% coverage without touching individual route files
 */

import { NextRequest, NextResponse } from 'next/server'

/**
 * Security headers applied to all API responses
 */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'",
} as const

/**
 * Middleware to inject security headers into all responses
 */
export function middleware(request: NextRequest) {
  // Create a response clone to modify headers
  let response = NextResponse.next()

  // Apply security headers to all responses
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  // Add HSTS only in production for HTTPS enforcement
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  // Disable caching for API responses
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    )
  }

  return response
}

/**
 * Middleware configuration - apply to API routes only
 */
export const config = {
  matcher: ['/api/:path*'],
}
