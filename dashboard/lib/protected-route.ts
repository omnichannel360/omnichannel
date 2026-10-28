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
        let errorMessage = 'Unauthorized'

        // Safely extract error message from context
        if (result.context && typeof result.context === 'object') {
          const contextObj: Record<string, unknown> = { ...result.context }
          if ('error' in contextObj && typeof contextObj.error === 'string') {
            errorMessage = contextObj.error
          }
        }

        return NextResponse.json(
          { success: false, error: errorMessage },
          { status: 401 }
        )
      }

      // Call the handler with authenticated context
      // Safely extract context properties with type checks
      const contextObj: Record<string, unknown> = { ...result.context }
      const userId = contextObj && typeof contextObj.userId === 'string' ? contextObj.userId : undefined
      const email = contextObj && typeof contextObj.email === 'string' ? contextObj.email : undefined
      const role = contextObj && typeof contextObj.role === 'string' ? contextObj.role : undefined

      return await handler(request, {
        userId,
        email,
        role,
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
  const result: Partial<{
    GET: (request: NextRequest) => Promise<NextResponse>
    POST: (request: NextRequest) => Promise<NextResponse>
    PUT: (request: NextRequest) => Promise<NextResponse>
    DELETE: (request: NextRequest) => Promise<NextResponse>
    PATCH: (request: NextRequest) => Promise<NextResponse>
  }> = {}

  Object.entries(handlers).forEach(([method, handler]) => {
    const httpMethod = method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    result[httpMethod] = protectRoute(handler, config)
  })

  return result as {
    GET?: (request: NextRequest) => Promise<NextResponse>
    POST?: (request: NextRequest) => Promise<NextResponse>
    PUT?: (request: NextRequest) => Promise<NextResponse>
    DELETE?: (request: NextRequest) => Promise<NextResponse>
    PATCH?: (request: NextRequest) => Promise<NextResponse>
  }
}
