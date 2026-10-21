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
 * @returns Rate limiter instance (guaranteed to exist due to set/get pattern)
 */
function getLimiter(config: RateLimitConfig): ReturnType<typeof createRateLimiter> {
  const key = `${config.keyPrefix}:${config.maxTokens}:${config.refillRate}`

  if (!limiters.has(key)) {
    limiters.set(key, createRateLimiter(config))
  }

  // Safe to use non-null assertion: we just ensured the key exists above
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
      const rateLimitHeaders = createRateLimitHeaders(remaining)

      // Set each rate limit header explicitly
      for (const [headerKey, headerValue] of Object.entries(rateLimitHeaders)) {
        headers.set(headerKey, String(headerValue))
      }

      // Return response with headers
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('Rate limit check failed - allowing request', error, {
        path: pathname,
        errorMsg,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      })
      // On error in rate limiter, allow request to proceed
      // (fail-open to prevent blocking valid traffic)
      return handler(request, context)
    }
  }
}

/**
 * Extract user ID from JWT token in request
 * WARNING: This function does NOT verify the JWT signature.
 * It should only be used for rate limiting key generation, not for authentication.
 * For actual authentication, use verifyToken() from @/lib/auth instead.
 *
 * @param request - The request object
 * @returns User ID if token payload is decodable, undefined otherwise
 */
export function extractUserId(request: Request): string | undefined {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return undefined
    }

    const token = authHeader.slice(7)
    const parts = token.split('.')

    // JWT must have 3 parts: header.payload.signature
    if (parts.length !== 3) {
      return undefined
    }

    // Safely decode and parse payload (does NOT verify signature - for rate limiting only)
    let payload: unknown
    try {
      const decodedPayload = Buffer.from(parts[1], 'base64').toString()
      payload = JSON.parse(decodedPayload)
    } catch (parseError) {
      // Invalid base64 or JSON - not a valid JWT structure
      return undefined
    }

    // Type guard: payload must be an object
    if (typeof payload !== 'object' || payload === null) {
      return undefined
    }

    // Return userId or sub, with explicit type safety
    const payloadObj = payload as Record<string, unknown>
    if (typeof payloadObj.userId === 'string') {
      return payloadObj.userId
    }
    if (typeof payloadObj.sub === 'string') {
      return payloadObj.sub
    }

    return undefined
  } catch (error) {
    // Silently return undefined on any unexpected error
    // (e.g., Buffer.from failure, unexpected exception)
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
