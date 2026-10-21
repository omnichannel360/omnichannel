/**
 * Rate Limiting Middleware for Next.js API Routes
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  TokenBucketRateLimiter,
  InMemoryRateLimitStore,
  RateLimitConfig,
  RateLimitPresets,
  getClientIp,
  createRateLimitHeaders,
} from './rate-limiter'

/**
 * Global rate limiter instance
 * Uses in-memory store by default
 */
let globalRateLimiter: TokenBucketRateLimiter | null = null
let globalStore: InMemoryRateLimitStore | null = null

/**
 * Initialize global rate limiter
 */
export function initializeRateLimiter(): TokenBucketRateLimiter {
  if (!globalRateLimiter) {
    globalStore = new InMemoryRateLimitStore()
    globalStore.startCleanup()
    globalRateLimiter = new TokenBucketRateLimiter(RateLimitPresets.api, globalStore)
  }
  return globalRateLimiter
}

/**
 * Get or create global rate limiter
 */
function getRateLimiter(): TokenBucketRateLimiter {
  return globalRateLimiter || initializeRateLimiter()
}

export interface RateLimitMiddlewareOptions {
  config?: RateLimitConfig
  keyGenerator?: (req: NextRequest) => string
  skip?: (req: NextRequest) => boolean
}

/**
 * Create rate limiting middleware for API routes
 *
 * Usage:
 * ```typescript
 * const rateLimitMiddleware = createRateLimitMiddleware({
 *   config: RateLimitPresets.auth
 * })
 *
 * export const POST = rateLimitMiddleware(async (req) => {
 *   // Your handler
 * })
 * ```
 */
export function createRateLimitMiddleware(
  options: RateLimitMiddlewareOptions = {}
) {
  const {
    config = RateLimitPresets.api,
    keyGenerator,
    skip,
  } = options

  const limiter = new TokenBucketRateLimiter(config, new InMemoryRateLimitStore())

  return function rateLimitHandler<T extends any[], R>(
    handler: (req: NextRequest, ...args: T) => Promise<R>
  ): (req: NextRequest, ...args: T) => Promise<NextResponse | R> {
    return async (req: NextRequest, ...args: T): Promise<NextResponse | R> => {
      // Skip rate limiting if needed
      if (skip?.(req)) {
        return handler(req, ...args)
      }

      // Generate rate limit key
      let key: string
      if (keyGenerator) {
        key = keyGenerator(req)
      } else {
        const ip = getClientIp(req.headers as Record<string, string | string[] | undefined>)
        const endpoint = new URL(req.url).pathname
        key = limiter.generateKey(ip, endpoint)
      }

      // Check rate limit
      const { allowed, remaining, resetTime } = await limiter.isAllowed(key)

      // Add rate limit headers to response
      const headers = createRateLimitHeaders(
        remaining,
        resetTime,
        config.maxRequests
      )

      // If rate limit exceeded
      if (!allowed) {
        return NextResponse.json(
          {
            error: config.message || 'Too many requests',
            retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
          },
          {
            status: 429,
            headers,
          }
        )
      }

      // Call handler and add rate limit headers to response
      const result = await handler(req, ...args)

      // If result is already a response, add headers
      if (result instanceof NextResponse) {
        headers['Content-Type'] = result.headers.get('Content-Type') || 'application/json'
        return new NextResponse(result.body, {
          status: result.status,
          headers: { ...Object.fromEntries(result.headers), ...headers },
        })
      }

      // Otherwise, wrap in response with headers
      return NextResponse.json(result, {
        headers,
      })
    }
  }
}

/**
 * Higher-order function to add rate limiting to an API handler
 *
 * Usage:
 * ```typescript
 * export const POST = withRateLimit(
 *   async (req) => { /* handler */ },
 *   { config: RateLimitPresets.auth }
 * )
 * ```
 */
export function withRateLimit<T extends any[], R>(
  handler: (req: NextRequest, ...args: T) => Promise<R>,
  options: RateLimitMiddlewareOptions = {}
): (req: NextRequest, ...args: T) => Promise<NextResponse | R> {
  const middleware = createRateLimitMiddleware(options)
  return middleware(handler)
}

/**
 * Factory function to create endpoint-specific rate limiters
 */
export function createEndpointRateLimiter(config: RateLimitConfig) {
  const limiter = new TokenBucketRateLimiter(config, new InMemoryRateLimitStore())

  return async (req: NextRequest) => {
    const ip = getClientIp(req.headers as Record<string, string | string[] | undefined>)
    const endpoint = new URL(req.url).pathname
    const key = limiter.generateKey(ip, endpoint)

    const { allowed, remaining, resetTime } = await limiter.isAllowed(key)

    return {
      allowed,
      remaining,
      resetTime,
      headers: createRateLimitHeaders(remaining, resetTime, config.maxRequests),
    }
  }
}

/**
 * Centralized rate limit checker using global limiter
 */
export async function checkRateLimit(
  req: NextRequest,
  preset: keyof typeof RateLimitPresets = 'api'
): Promise<{
  allowed: boolean
  remaining: number
  resetTime: number
  headers: Record<string, string>
}> {
  const limiter = getRateLimiter()
  const config = RateLimitPresets[preset]

  const ip = getClientIp(req.headers as Record<string, string | string[] | undefined>)
  const endpoint = new URL(req.url).pathname
  const key = limiter.generateKey(ip, endpoint)

  const { allowed, remaining, resetTime } = await limiter.isAllowed(key)

  return {
    allowed,
    remaining,
    resetTime,
    headers: createRateLimitHeaders(remaining, resetTime, config.maxRequests),
  }
}

/**
 * Reset rate limit for a specific key (admin/debug use)
 */
export async function resetRateLimit(key: string): Promise<void> {
  const limiter = getRateLimiter()
  await limiter.resetKey(key)
}
