import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, TokenPayload, AuthErrors } from './auth'
import { createLogger } from './logger'

const logger = createLogger('auth-middleware')

// Default timeout for auth operations
const AUTH_TIMEOUT_MS = 5000 // 5 seconds

// Handler callback type - accepts TokenPayload or compatible user object
type AuthHandler = (
  req: NextRequest,
  user: TokenPayload | Record<string, unknown>
) => Promise<NextResponse>
type OptionalAuthHandler = (
  req: NextRequest,
  user?: TokenPayload | Record<string, unknown>
) => Promise<NextResponse>

/**
 * Middleware to protect API routes with JWT authentication
 * Usage: Wrap your API route handler with this middleware
 * @param request - NextRequest object
 * @param handler - Route handler that receives authenticated user (TokenPayload or compatible object)
 */
export async function protectRoute(
  request: NextRequest,
  handler: AuthHandler
): Promise<NextResponse> {
  let timeoutId: NodeJS.Timeout | null = null

  try {
    // Wrap token verification in timeout to prevent hanging requests
    const verifyPromise = verifyToken(request)

    // Create timeout promise with proper cleanup
    // Type as Promise<never> because this promise only rejects, never resolves
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Auth verification timeout'))
      }, AUTH_TIMEOUT_MS)
    })

    // Race with immediate cleanup
    let user: TokenPayload | Record<string, unknown> | null = null
    try {
      user = await Promise.race([verifyPromise, timeoutPromise])
    } finally {
      // Always clear timeout, whether race succeeded or failed
      if (timeoutId) clearTimeout(timeoutId)
    }

    if (!user) {
      return NextResponse.json(
        { error: AuthErrors.MISSING_TOKEN.message },
        { status: AuthErrors.MISSING_TOKEN.status }
      )
    }

    return await handler(request, user)
  } catch (error) {
    // Ensure timeout is cleaned up in all error cases
    if (timeoutId) clearTimeout(timeoutId)

    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage === 'Auth verification timeout') {
      logger.warn('Token verification timeout', { path: request.nextUrl.pathname })
      return NextResponse.json(
        { error: 'Authentication timeout' },
        { status: 408 } // Request Timeout
      )
    }

    logger.error('Auth middleware error during request processing', error, {
      path: request.nextUrl.pathname,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    })
    return NextResponse.json(
      { error: AuthErrors.UNAUTHORIZED.message },
      { status: AuthErrors.UNAUTHORIZED.status }
    )
  }
}

/**
 * Middleware for optional authentication
 * Attaches user if token is valid, but doesn't fail without one
 * @param request - NextRequest object
 * @param handler - Route handler that receives optional authenticated user (TokenPayload or compatible object)
 */
export async function protectRouteOptional(
  request: NextRequest,
  handler: OptionalAuthHandler
): Promise<NextResponse> {
  let timeoutId: NodeJS.Timeout | null = null

  try {
    // Wrap token verification in timeout with proper cleanup
    const verifyPromise = verifyToken(request)
    const timeoutPromise = new Promise<null>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Auth verification timeout'))
      }, AUTH_TIMEOUT_MS)
    })

    let user: TokenPayload | Record<string, unknown> | null = null
    try {
      user = await Promise.race([verifyPromise, timeoutPromise])
    } catch {
      // Treat timeout and auth errors as unauthenticated for optional routes
      user = null
    } finally {
      // Always clear timeout
      if (timeoutId) clearTimeout(timeoutId)
    }

    // Pass user to handler if valid, otherwise pass undefined (not error state)
    return await handler(request, user || undefined)
  } catch (error) {
    // Ensure timeout is cleaned up in all error cases
    if (timeoutId) clearTimeout(timeoutId)

    // For optional auth, treat verification failure as unauthenticated (not error)
    logger.warn('Optional auth verification failed - continuing unauthenticated', {
      path: request.nextUrl.pathname,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    })
    // Always proceed with handler, never throw on optional auth failure
    return await handler(request, undefined)
  }
}
