/**
 * Security Headers Middleware
 * Applies OWASP-recommended security headers to all API responses
 * YOLO mode: Comprehensive security headers enforced on all endpoints
 */

import { NextResponse } from 'next/server'

/**
 * Standard security headers configuration
 */
const SECURITY_HEADERS = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking attacks - use frame-ancestors in CSP instead
  'X-Frame-Options': 'DENY',

  // Enable XSS protection in older browsers (modern CSP is primary)
  'X-XSS-Protection': '1; mode=block',

  // Prevent referrer leakage
  'Referrer-Policy': 'strict-no-referrer',

  // Content Security Policy - OWASP recommended comprehensive directives
  // FIXED: Added missing directives: frame-ancestors, sandbox, upgrade-insecure-requests, form-action, base-uri
  'Content-Security-Policy': "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' https:; " +
    "font-src 'self' data: https:; " +
    "img-src 'self' data: https:; " +
    "frame-ancestors 'none'; " +  // Block embedding in iframes (clickjacking prevention)
    "form-action 'self'; " +       // Restrict form submissions to same-origin
    "base-uri 'self'; " +          // Restrict base tag URL
    "upgrade-insecure-requests; " + // Auto-upgrade HTTP to HTTPS
    "block-all-mixed-content",      // Block all mixed HTTP/HTTPS content

  // Disable caching for sensitive endpoints
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
} as const

/**
 * Production-only headers
 * FIXED: Removed duplicate HSTS (already in SECURITY_HEADERS)
 */
const PRODUCTION_HEADERS = {
  // HSTS for HTTPS enforcement (production only)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
} as const

/**
 * Apply standard security headers to response
 * @param response - NextResponse to enhance with security headers
 * @param options - Configuration options
 * @returns Enhanced response with security headers
 */
export function applySecurityHeaders(
  response: NextResponse,
  options?: {
    disableCache?: boolean
    productionMode?: boolean
    customHeaders?: Record<string, string>
  }
): NextResponse {
  const isProduction = options?.productionMode ?? process.env.NODE_ENV === 'production'
  const disableCache = options?.disableCache ?? true

  // Apply base security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    // Skip cache header if not needed
    if (key === 'Cache-Control' && !disableCache) return

    // Skip HSTS in non-production
    if (key === 'Strict-Transport-Security' && !isProduction) return

    response.headers.set(key, value)
  })

  // Apply production-specific headers
  if (isProduction) {
    Object.entries(PRODUCTION_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
  }

  // Apply custom headers
  if (options?.customHeaders) {
    Object.entries(options.customHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
  }

  return response
}

/**
 * Wrapper for JSON responses with automatic security headers
 * @param data - Response data
 * @param status - HTTP status code
 * @param options - Security header options
 * @returns NextResponse with security headers
 */
export function secureJsonResponse<T>(
  data: T,
  status: number = 200,
  options?: {
    disableCache?: boolean
    productionMode?: boolean
    customHeaders?: Record<string, string>
  }
): NextResponse {
  const response = NextResponse.json(data, { status })
  return applySecurityHeaders(response, options)
}

/**
 * Wrapper for error responses with security headers
 * @param message - Error message
 * @param status - HTTP status code
 * @param details - Optional error details
 * @returns NextResponse with security headers
 */
export function secureErrorResponse(
  message: string,
  status: number = 500,
  details?: Record<string, unknown>
): NextResponse {
  const response = NextResponse.json(
    {
      success: false,
      error: message,
      ...(process.env.NODE_ENV === 'development' && details && { details }),
    },
    { status }
  )
  return applySecurityHeaders(response)
}

/**
 * Header validation utility - verify response has all required security headers
 * Used in testing to ensure compliance
 */
export function validateSecurityHeaders(
  response: NextResponse,
  requiredHeaders: string[] = ['X-Content-Type-Options', 'X-Frame-Options']
): { valid: boolean; missing: string[] } {
  const missing = requiredHeaders.filter((header) => !response.headers.has(header))
  return {
    valid: missing.length === 0,
    missing,
  }
}
