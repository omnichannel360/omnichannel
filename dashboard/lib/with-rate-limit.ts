/**
 * Rate Limiting Middleware Wrapper
 * Applies rate limiting to API route handlers
 */

import { createRateLimiter, type RateLimitConfig } from './rate-limiter'
import {
  getEndpointConfig,
  getRateLimitKey,
  createRateLimitErrorResponse,
  createRateLimitHeaders,
} from './rate-limit-config'
import { createLogger } from './logger'

const logger = createLogger('rate-limit')

// Global rate limiter instances for each config
const limiters: Map<string, ReturnType<typeof createRateLimiter>> = new Map()

/**
 * Get or create a rate limiter for the given config
 */
function getLimiter(config: RateLimitConfig): ReturnType<typeof createRateLimiter> {
  const key = `${config.keyPrefix}:${config.maxTokens}:${config.refillRate}`

  if (!limiters.has(key)) {
    limiters.set(key, createRateLimiter(config))
  }

  return limiters.get(key)!
}

export type RouteHandler = (
  request: Request,
  context?: { params: Record<string, unknown> }
) => Promise<Response>

/**
 * Wrap a route handler with rate limiting
 * @param handler - The original route handler
 * @param options - Optional configuration overrides
 */
export function withRateLimit(
  handler: RouteHandler,
  options?: {
    config?: RateLimitConfig
    pathname?: string
    getUserId?: (request: Request) => string | undefined
  }
): RouteHandler {
  return async (request: Request, context?: { params: Record<string, unknown> }) => {
    try {
      // Get pathname - try options first, then extract from request
      let pathname = options?.pathname || new URL(request.url).pathname

      // Get rate limit configuration
      const config = options?.config || getEndpointConfig(pathname)
      const limiter = getLimiter(config)

      // Get user ID if available
      const userId = options?.getUserId?.(request)

      // Get rate limit key
      const key = getRateLimitKey(pathname, request, userId)

      // Check if request is allowed
      const allowed = await limiter.isAllowed(key)

      if (!allowed) {
        const remaining = await limiter.getRemaining(key)
        return createRateLimitErrorResponse(remaining)
      }

      // Get remaining tokens for response header
      const remaining = await limiter.getRemaining(key)

      // Call the actual handler
      const response = await handler(request, context)

      // Add rate limit headers to response
      const headers = new Headers(response.headers)
      Object.entries(createRateLimitHeaders(remaining)).forEach(
        ([key, value]) => {
          headers.set(key, value)
        }
      )

      // Return response with headers
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch (error) {
      logger.error('[Rate Limit] Error:', error)
      // On error, allow request but log it
      return handler(request, context)
    }
  }
}

/**
 * Extract user ID from JWT token in request
 * @param request - The request object
 * @returns User ID if authenticated, undefined otherwise
 */
export function extractUserId(request: Request): string | undefined {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return undefined
    }

    // This is a simple extraction - in production, verify the JWT
    const token = authHeader.slice(7)
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())

    return payload.userId || payload.sub
  } catch {
    return undefined
  }
}

/**
 * Create a rate limit middleware for Next.js API routes
 * Usage:
 *   export const POST = withRateLimit(async (req) => { ... })
 *   export const GET = withRateLimit(async (req) => { ... }, { pathname: '/api/custom' })
 */
export default withRateLimit
