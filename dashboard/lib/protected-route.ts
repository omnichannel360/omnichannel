import { NextRequest, NextResponse } from 'next/server'
import { withAuthProtection, ProtectedRouteConfig } from './auth-middleware-wrapper'
import { logger } from './logger'

export type RouteHandler = (
  request: NextRequest,
  context: {
    userId?: string
    email?: string
    role?: string
  }
) => Promise<NextResponse>

/**
 * Wrap a route handler with authentication protection
 * 
 * Usage:
 * export const GET = protectRoute(
 *   async (request, { userId }) => {
 *     // Your route logic here
 *     return NextResponse.json({ data: 'protected' })
 *   },
 *   { requireAuth: true, rateLimitKey: 'endpoint_name' }
 * )
 */
export function protectRoute(
  handler: RouteHandler,
  config: ProtectedRouteConfig = { requireAuth: true }
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      const result = await withAuthProtection(request, config)

      // If auth failed, return the error response
      if (!result.authenticated && result.response) {
        return result.response
      }

      // If auth failed but no response (shouldn't happen), return 401
      if (!result.authenticated) {
        return NextResponse.json(
          { success: false, error: result.context.error || 'Unauthorized' },
          { status: 401 }
        )
      }

      // Call the handler with authenticated context
      return await handler(request, {
        userId: result.context.userId,
        email: result.context.email,
        role: result.context.role,
      })
    } catch (error) {
      logger.error('Protected route handler error', error, {
        method: request.method,
        path: request.nextUrl.pathname,
      })

      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}

/**
 * Protect multiple HTTP methods in a single route file
 * 
 * Usage:
 * const protectedHandlers = protectRouteMulti(
 *   {
 *     GET: async (request, context) => {
 *       return NextResponse.json({ data: 'get' })
 *     },
 *     POST: async (request, context) => {
 *       return NextResponse.json({ data: 'post' })
 *     }
 *   },
 *   { requireAuth: true }
 * )
 * 
 * export const GET = protectedHandlers.GET
 * export const POST = protectedHandlers.POST
 */
export function protectRouteMulti(
  handlers: {
    GET?: RouteHandler
    POST?: RouteHandler
    PUT?: RouteHandler
    DELETE?: RouteHandler
    PATCH?: RouteHandler
  },
  config: ProtectedRouteConfig = { requireAuth: true }
): {
  GET?: (request: NextRequest) => Promise<NextResponse>
  POST?: (request: NextRequest) => Promise<NextResponse>
  PUT?: (request: NextRequest) => Promise<NextResponse>
  DELETE?: (request: NextRequest) => Promise<NextResponse>
  PATCH?: (request: NextRequest) => Promise<NextResponse>
} {
  const result: any = {}

  Object.entries(handlers).forEach(([method, handler]) => {
    result[method] = protectRoute(handler, config)
  })

  return result
}
