/**
 * Rate Limiting Middleware for Next.js API Routes
 * - Type-safe rate limiter integration
 * - Proper error handling and logging
 * - Cleanup on shutdown
 * - Per-endpoint configuration
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  RateLimiter,
  RateLimitConfig,
  RateLimitPresets,
  getClientIp,
  createRateLimitHeaders,
} from './rate-limiter'

/**
 * Global rate limiter instances (one per preset)
 */
const limiters: Map<string, RateLimiter> = new Map()

function getLimiter(config: RateLimitConfig): RateLimiter {
  const key = config.keyPrefix
  if (!limiters.has(key)) {
    limiters.set(key, new RateLimiter(config))
  }
  return limiters.get(key)!
}

export interface RateLimitMiddlewareOptions {
  config: RateLimitConfig
  skip?: (request: NextRequest) => boolean
}

/**
 * Rate limit middleware for Next.js API routes
 * Wrap handler with rate limiting
 *
 * Usage:
 * ```typescript
 * export const GET = withRateLimit(
 *   async (req) => {
 *     return NextResponse.json({ success: true })
 *   },
 *   { config: RateLimitPresets.api }
 * )
 * ```
 */
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: RateLimitMiddlewareOptions
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Skip rate limiting if condition is met
    if (options.skip?.(request)) {
      return handler(request)
    }

    const limiter = getLimiter(options.config)

    // Extract client info
    const ip = getClientIp(request.headers as Record<string, string | string[] | undefined>)
    const userId = extractUserId(request)
    const apiKey = extractApiKey(request)

    // Check rate limit
    const result = await limiter.check(ip, userId, apiKey)

    // Create response
    let response: NextResponse

    if (!result.allowed) {
      response = NextResponse.json(
        {
          error: 'rate_limit_exceeded',
          message: 'Too many requests, please try again later',
          retryAfter: result.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfter || 60),
          },
        }
      )
    } else {
      response = await handler(request)
    }

    // Add rate limit headers to response
    const headers = createRateLimitHeaders(
      result.remaining,
      result.resetAt,
      options.config.requestsPerWindow
    )

    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value)
    })

    return response
  }
}

/**
 * Extract user ID from request (from auth token or session)
 */
function extractUserId(request: NextRequest): string | undefined {
  // Try to get from Authorization header
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    // In production, verify and decode the token
    // For now, just use the suffix
    return authHeader.substring(7)
  }

  // Try to get from cookie
  const sessionCookie = request.cookies.get('auth')
  if (sessionCookie?.value) {
    return sessionCookie.value
  }

  return undefined
}

/**
 * Extract API key from request
 */
function extractApiKey(request: NextRequest): string | undefined {
  // Try Authorization header with ApiKey scheme
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('ApiKey ')) {
    return authHeader.substring(7)
  }

  // Try X-API-Key header
  const apiKeyHeader = request.headers.get('x-api-key')
  if (apiKeyHeader) {
    return apiKeyHeader
  }

  return undefined
}

/**
 * Cleanup all rate limiters on application shutdown
 */
export async function cleanupRateLimiters(): Promise<void> {
  const cleanupPromises: Promise<void>[] = []

  for (const limiter of limiters.values()) {
    cleanupPromises.push(limiter.cleanup())
  }

  await Promise.all(cleanupPromises)
  limiters.clear()
}

/**
 * Health check endpoint that bypasses rate limiting
 */
export function createHealthCheckSkip(): (request: NextRequest) => boolean {
  return (request: NextRequest) => {
    return request.nextUrl.pathname === '/api/health'
  }
}
