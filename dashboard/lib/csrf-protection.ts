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
 * IMPORTANT: This middleware clones the request before reading the body,
 * so the original request body is preserved for route handlers.
 * The cloned body is only used to extract the CSRF token.
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

    // FIXED: Clone request to preserve body for route handler
    // Next.js request bodies can only be read once, so we must clone
    // to avoid consuming the body stream.
    let tokenFromBody: string | null = null

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        // Clone the request to read body without consuming the original
        const clonedRequest = request.clone()
        const body = await clonedRequest.json()
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
 *
 * This function was fragile because it tried to parse Set-Cookie headers.
 * setCsrfTokenCookie now returns the generated token directly.
 *
 * CORRECT pattern:
 * ```typescript
 * const token = setCsrfTokenCookie(response)  // Returns token directly
 * response.headers.set('X-CSRF-Token', token) // Send to client if needed
 * ```
 *
 * @deprecated Use the return value from setCsrfTokenCookie() instead
 * @throws Error if called - use setCsrfTokenCookie() return value instead
 */
export function getCsrfTokenFromResponse(_response: NextResponse): never {
  throw new Error(
    'getCsrfTokenFromResponse is deprecated. Use setCsrfTokenCookie(response) return value instead. ' +
    'setCsrfTokenCookie now returns the generated token directly.'
  )
}
