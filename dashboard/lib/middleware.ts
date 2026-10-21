import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, TokenPayload, AuthErrors } from './auth'
import { createLogger } from './logger'

const logger = createLogger('auth-middleware')

// Default timeout for auth operations
const AUTH_TIMEOUT_MS = 5000 // 5 seconds

/**
 * Middleware to protect API routes with JWT authentication
 * Usage: Wrap your API route handler with this middleware
 */
export async function protectRoute(
  request: NextRequest,
  handler: (req: NextRequest, user: TokenPayload) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    // Wrap token verification in timeout to prevent hanging requests
    const user = await Promise.race([
      verifyToken(request),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Auth verification timeout')), AUTH_TIMEOUT_MS)
      ),
    ]).catch((error) => {
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
    const errorMsg = error instanceof Error ? error.message : String(error)
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
 */
export async function protectRouteOptional(
  request: NextRequest,
  handler: (req: NextRequest, user?: TokenPayload) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    // Wrap token verification in timeout
    const user = await Promise.race([
      verifyToken(request),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Auth verification timeout')), AUTH_TIMEOUT_MS)
      ),
    ]).catch(() => null) // Treat timeout as unauthenticated

    // Pass user to handler if valid, otherwise pass undefined (not error state)
    return await handler(request, user || undefined)
  } catch (error) {
    // For optional auth, treat verification failure as unauthenticated (not error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.warn('Optional auth verification failed - continuing unauthenticated', {
      path: request.nextUrl.pathname,
      errorMsg,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    })
    // Always proceed with handler, never throw on optional auth failure
    return await handler(request, undefined)
  }
}
