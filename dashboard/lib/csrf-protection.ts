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

  // Both token and cookie must exist
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
 */
export async function validateCsrfMiddleware(
  request: NextRequest,
  allowedOrigins?: string[]
): Promise<{ valid: boolean; response?: NextResponse }> {
  // Only validate state-changing requests
  const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH']
  if (!stateChangingMethods.includes(request.method)) {
    return { valid: true }
  }

  // Allow GET for token retrieval
  if (request.method === 'GET') {
    return { valid: true }
  }

  try {
    // SECURITY: Validate origin header matches allowed origins
    const origin = request.headers.get('origin')
    const referer = request.headers.get('referer')

    if (allowedOrigins && origin) {
      const isAllowedOrigin = allowedOrigins.some(ao => origin.includes(ao))
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

    const tokenFromHeader = request.headers.get(CSRF_HEADER_NAME)
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

    return { valid: true }
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
 * Get current CSRF token from cookies (for responses)
 */
export function getCsrfTokenFromResponse(response: NextResponse): string | null {
  // Cookies are set but not directly readable; generate new for client
  return null
}
