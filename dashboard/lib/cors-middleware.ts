/**
 * CORS Middleware
 * Prevents cross-origin attack vectors (CSRF, origin-based attacks)
 * YOLO Mode: Strict allowlist-based configuration
 */

import { NextRequest, NextResponse } from 'next/server'

/**
 * Allowed origins for CORS - allowlist approach only
 */
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8000',
  'https://omni360.omnichannelsol.com',
  'https://app.omnichannelsol.com',
  // Add your production domains here
] as const

type AllowedOrigin = (typeof ALLOWED_ORIGINS)[number]

/**
 * Allowed HTTP methods
 */
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']

/**
 * Allowed headers
 */
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-API-Key',
  'X-User-ID',
  'X-Correlation-ID',
]

/**
 * Check if origin is in allowed list with type safety
 */
function isAllowedOrigin(origin: string): origin is AllowedOrigin {
  return ALLOWED_ORIGINS.includes(origin as AllowedOrigin)
}

/**
 * Apply CORS headers to response
 * @param response - NextResponse to enhance
 * @param origin - Request origin (if allowed)
 * @returns Response with CORS headers if origin is allowed
 */
export function applyCorsHeaders(response: NextResponse, origin: string | null): NextResponse {
  if (!origin || !isAllowedOrigin(origin)) {
    // Don't add CORS headers for disallowed origins
    return response
  }

  response.headers.set('Access-Control-Allow-Origin', origin)
  response.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '))
  response.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '))
  response.headers.set('Access-Control-Max-Age', '86400')
  response.headers.set('Access-Control-Allow-Credentials', 'true')

  return response
}

/**
 * CORS middleware handler
 * @param request - NextRequest to validate
 * @returns NextResponse with appropriate CORS handling
 */
export function corsMiddleware(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin')

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    let response = new NextResponse(null, { status: 204 })
    response = applyCorsHeaders(response, origin)
    return response
  }

  // Continue processing - CORS headers will be added by response middleware
  return null
}

/**
 * Validate CORS for regular requests
 * @param origin - Request origin
 * @returns True if origin is allowed
 */
export function isCorsOriginAllowed(origin: string | null): boolean {
  if (!origin) return false
  return isAllowedOrigin(origin)
}
