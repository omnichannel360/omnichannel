import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, TokenPayload, AuthErrors } from './auth'
import { createLogger } from './logger'

const logger = createLogger('auth-middleware')

// Default timeout for auth operations
const AUTH_TIMEOUT_MS = 5000 // 5 seconds

// Handler callback type - accepts TokenPayload or compatible user object
type AuthHandler = (req: NextRequest, user: TokenPayload | Record<string, unknown>) => Promise<NextResponse>
type OptionalAuthHandler = (req: NextRequest, user?: TokenPayload | Record<string, unknown>) => Promise<NextResponse>

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
  try {
    // Wrap token verification in timeout to prevent hanging requests
    // Use Promise.race with proper timeout cleanup to prevent unhandled rejections
    let timeoutId: NodeJS.Timeout | null = null
    const verifyPromise = verifyToken(request)
    const timeoutPromise = new Promise<null>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Auth verification timeout'))
      }, AUTH_TIMEOUT_MS)
    })

    const user = await Promise.race([verifyPromise, timeoutPromise])
      .then((result) => {
        // Clear timeout when race completes successfully
        if (timeoutId) clearTimeout(timeoutId)
        return result
      })
      .catch((error) => {
        // Clear timeout on error
        if (timeoutId) clearTimeout(timeoutId)
        // If timeout or verification error, return null
        if (error instanceof Error && error.message === 'Auth verification timeout') {
          logger.warn('Token verification timeout', { path: request.nextUrl.pathname })
        }
        return null
      })

    if (!user) {
      return NextResponse.json(
        { error: AuthErrors.MISSING_TOKEN.message },
        { status: AuthErrors.MISSING_TOKEN.status }
      )
    }

    return await handler(request, user)
  } catch (error) {
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
  try {
    // Wrap token verification in timeout with proper cleanup to prevent unhandled rejections
    let timeoutId: NodeJS.Timeout | null = null
    const verifyPromise = verifyToken(request)
    const timeoutPromise = new Promise<null>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Auth verification timeout'))
      }, AUTH_TIMEOUT_MS)
    })

    const user = await Promise.race([verifyPromise, timeoutPromise])
      .then((result) => {
        // Clear timeout when race completes successfully
        if (timeoutId) clearTimeout(timeoutId)
        return result
      })
      .catch(() => {
        // Clear timeout on error
        if (timeoutId) clearTimeout(timeoutId)
        // Treat timeout as unauthenticated
        return null
      })

    // Pass user to handler if valid, otherwise pass undefined (not error state)
    return await handler(request, user || undefined)
  } catch (error) {
    // For optional auth, treat verification failure as unauthenticated (not error)
    logger.warn('Optional auth verification failed - continuing unauthenticated', {
      path: request.nextUrl.pathname,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    })
    // Always proceed with handler, never throw on optional auth failure
    return await handler(request, undefined)
  }
}
