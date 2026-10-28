import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from './auth'
import { applyRateLimit } from './api-rate-limit-middleware'
import { logger, createLogContext } from './logger'

export interface ProtectedRouteConfig {
  requiredRoles?: string[]
  requireAuth?: boolean
  rateLimitKey?: Parameters<typeof applyRateLimit>[1]
}

export interface AuthContext {
  authenticated: boolean
  userId?: string
  email?: string
  role?: string
  error?: string
}

/**
 * Middleware wrapper to protect an API route with authentication
 * Usage in route handlers:
 *
 * export async function GET(request: NextRequest) {
 *   const result = await withAuthProtection(request, {
 *     requireAuth: true,
 *     rateLimitKey: 'endpoint_name'
 *   })
 *
 *   if (!result.authenticated) {
 *     return result.response
 *   }
 *
 *   const context = result.context
 *   // Your route logic here
 * }
 */
export async function withAuthProtection(
  request: NextRequest,
  config: ProtectedRouteConfig = { requireAuth: true }
): Promise<{
  authenticated: boolean
  context: AuthContext
  response?: NextResponse
}> {
  const startTime = Date.now()

  try {
    // Apply rate limiting if configured
    if (config.rateLimitKey) {
      const rateLimitError = await applyRateLimit(request, config.rateLimitKey)
      if (rateLimitError) {
        return {
          authenticated: false,
          context: {
            authenticated: false,
            error: 'Rate limit exceeded',
          },
          response: rateLimitError,
        }
      }
    }

    // Check if authentication is required
    if (!config.requireAuth) {
      return {
        authenticated: true,
        context: {
          authenticated: true,
        },
      }
    }

    // Verify authentication
    const authResult = await verifyAuth(request)

    if (!authResult.authenticated) {
      logger.warn('Unauthorized API access attempt', {
        method: request.method,
        path: request.nextUrl.pathname,
        error: authResult.error,
        responseTimeMs: Date.now() - startTime,
      })

      return {
        authenticated: false,
        context: {
          authenticated: false,
          error: authResult.error || 'Authentication required',
        },
        response: NextResponse.json(
          {
            success: false,
            error: authResult.error || 'Authentication required',
          },
          { status: 401 }
        ),
      }
    }

    // Check required roles if specified
    if (config.requiredRoles && config.requiredRoles.length > 0) {
      const userRole = authResult.payload?.role
      if (!userRole || !config.requiredRoles.includes(userRole)) {
        logger.warn('Unauthorized role access attempt', {
          method: request.method,
          path: request.nextUrl.pathname,
          userRole,
          requiredRoles: config.requiredRoles,
          userId: authResult.payload?.sub,
          responseTimeMs: Date.now() - startTime,
        })

        return {
          authenticated: false,
          context: {
            authenticated: false,
            error: 'Insufficient permissions',
          },
          response: NextResponse.json(
            {
              success: false,
              error: 'Insufficient permissions',
            },
            { status: 403 }
          ),
        }
      }
    }

    const context: AuthContext = {
      authenticated: true,
      userId: authResult.payload?.sub,
      email: authResult.payload?.email,
      role: authResult.payload?.role,
    }

    logger.debug('API request authenticated', {
      userId: context.userId,
      method: request.method,
      path: request.nextUrl.pathname,
      responseTimeMs: Date.now() - startTime,
    })

    return {
      authenticated: true,
      context,
    }
  } catch (error) {
    logger.error('Auth protection middleware error', error, {
      method: request.method,
      path: request.nextUrl.pathname,
      responseTimeMs: Date.now() - startTime,
    })

    return {
      authenticated: false,
      context: {
        authenticated: false,
        error: 'Internal server error',
      },
      response: NextResponse.json(
        {
          success: false,
          error: 'Internal server error',
        },
        { status: 500 }
      ),
    }
  }
}

/**
 * Create an unauthorized response
 */
export function createAuthErrorResponse(
  message: string,
  statusCode: number = 401
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: statusCode }
  )
}
