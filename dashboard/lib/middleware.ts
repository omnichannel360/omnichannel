import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, AuthErrors } from './auth'
import { createLogger } from './logger'

const logger = createLogger('auth-middleware')

/**
 * Middleware to protect API routes with JWT authentication
 * Usage: Wrap your API route handler with this middleware
 */
export async function protectRoute(
  request: NextRequest,
  handler: (req: NextRequest, user: any) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const user = await verifyToken(request)

    if (!user) {
      return NextResponse.json(
        { error: AuthErrors.MISSING_TOKEN.message },
        { status: AuthErrors.MISSING_TOKEN.status }
      )
    }

    return await handler(request, user)
  } catch (error) {
    logger.error('[Auth Middleware Error]', error)
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
  handler: (req: NextRequest, user?: any) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const user = await verifyToken(request)
    return await handler(request, user || undefined)
  } catch (error) {
    logger.error('[Auth Middleware Error]', error)
    return NextResponse.json(
      { error: AuthErrors.UNAUTHORIZED.message },
      { status: AuthErrors.UNAUTHORIZED.status }
    )
  }
}
