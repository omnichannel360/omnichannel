/**
 * CSRF Token Protection Middleware
 * Implements double-submit cookie pattern for CSRF prevention
 * SECURITY: Required for all state-changing requests (POST, PUT, DELETE, PATCH)
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const CSRF_TOKEN_LENGTH = 32
const CSRF_COOKIE_NAME = '__Host-csrf'
const CSRF_HEADER_NAME = 'x-csrf-token'

/**
 * Generate a random CSRF token
 */
function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex')
}

/**
 * Verify CSRF token from request
 * Compares token from header with token from secure cookie
 */
export function verifyCsrfToken(
  request: NextRequest,
  tokenFromBody: string | null
): { valid: boolean; error?: string } {
  const tokenFromHeader = request.headers.get(CSRF_HEADER_NAME)
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value

  // Token must exist in either header or body
  if (!tokenFromHeader && !tokenFromBody) {
    return { valid: false, error: 'CSRF token missing from request' }
  }

  if (!cookieToken) {
    return { valid: false, error: 'CSRF token missing from cookies' }
  }

  // Use timing-safe comparison
  const token = tokenFromHeader || tokenFromBody
  if (!token) {
    return { valid: false, error: 'CSRF token missing' }
  }

  try {
    const tokenBuffer = Buffer.from(token)
    const cookieBuffer = Buffer.from(cookieToken)

    if (tokenBuffer.length !== cookieBuffer.length) {
      return { valid: false, error: 'CSRF token mismatch' }
    }

    const matches = crypto.timingSafeEqual(tokenBuffer, cookieBuffer)
    if (!matches) {
      return { valid: false, error: 'CSRF token validation failed' }
    }

    return { valid: true }
  } catch (error) {
    return { valid: false, error: 'CSRF token validation error' }
  }
}

/**
 * Create or refresh CSRF token cookie
 */
export function setCsrfTokenCookie(response: NextResponse): string {
  const token = generateCsrfToken()

  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600, // 1 hour
    path: '/',
  })

  return token
}

/**
 * Middleware to validate CSRF token on state-changing requests
 * SECURITY: Also validates origin/referer to prevent cross-site attacks
 *
 * NOTE: Request body is consumed by this middleware. If you need the body
 * in your route handler, use a separate request object or clone the request
 * before calling this middleware. Next.js request bodies can only be read once.
 */
export async function validateCsrfMiddleware(
  request: NextRequest,
  allowedOrigins?: string[]
): Promise<{ valid: boolean; response?: NextResponse; tokenFromBody?: string | null }> {
  // Only validate state-changing requests
  const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH']
  if (!stateChangingMethods.includes(request.method)) {
    return { valid: true }
  }

  try {
    // SECURITY: Validate origin header matches allowed origins (exact match)
    const origin = request.headers.get('origin')
    const referer = request.headers.get('referer')

    if (allowedOrigins && origin) {
      // Use exact match instead of substring - prevents origin spoofing
      // Example: "attacker.com" should NOT match "evil.attacker.com"
      const isAllowedOrigin = allowedOrigins.includes(origin)
      if (!isAllowedOrigin) {
        return {
          valid: false,
          response: NextResponse.json(
            { success: false, error: 'Origin not allowed' },
            { status: 403 }
          ),
        }
      }
    }

    // Try to get token from header or body
    let tokenFromBody: string | null = null

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        const body = await request.json()
        tokenFromBody = body._csrf || body.csrfToken || null
      } catch {
        // Body parse error - token must be in header
      }
    }

    const result = verifyCsrfToken(request, tokenFromBody)

    if (!result.valid) {
      return {
        valid: false,
        response: NextResponse.json(
          { success: false, error: 'CSRF token validation failed' },
          { status: 403 }
        ),
      }
    }

    return { valid: true, tokenFromBody }
  } catch (error) {
    return {
      valid: false,
      response: NextResponse.json(
        { success: false, error: 'CSRF validation error' },
        { status: 400 }
      ),
    }
  }
}

/**
 * DEPRECATED: Use the return value from setCsrfTokenCookie instead.
 * setCsrfTokenCookie already returns the generated token, so this function
 * is unnecessary and fragile (parses Set-Cookie headers).
 *
 * Example instead:
 * const token = setCsrfTokenCookie(response) // Returns token directly
 * response.headers.set('X-CSRF-Token', token) // Send to client if needed
 *
 * @deprecated Use the return value from setCsrfTokenCookie() instead
 */
export function getCsrfTokenFromResponse(response: NextResponse): string | null {
  // This function is kept for backwards compatibility but should not be used
  console.warn('[DEPRECATED] getCsrfTokenFromResponse() is deprecated. Use the return value from setCsrfTokenCookie() instead.')
  return null
}
