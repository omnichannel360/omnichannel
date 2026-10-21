/**
 * Rate Limiting Middleware
 * Applies rate limiting to Next.js API routes
 * Supports per-endpoint configuration
 */

import { NextRequest, NextResponse } from 'next/server'
import { getStore, RateLimitConfig } from './store'

export interface RateLimitMiddlewareConfig extends RateLimitConfig {
  endpoint: string
  onLimitExceeded?: (remaining: number, resetTime: number) => NextResponse
  getKey?: (request: NextRequest) => string
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const ip = forwardedFor?.split(',')[0] || realIp || 'unknown'
  return ip.trim()
}

/**
 * Generate key based on authenticated user
 */
export function userKeyGenerator(userId: string) {
  return (request: NextRequest): string => {
    return `user:${userId}`
  }
}

/**
 * Rate limiting middleware function
 */
export function createRateLimitMiddleware(config: RateLimitMiddlewareConfig) {
  const store = getStore()
  const keyGenerator = config.getKey || defaultKeyGenerator

  return async (request: NextRequest): Promise<{
    allowed: boolean
    response?: NextResponse
    remaining?: number
    resetTime?: number
    limit?: number
  }> => {
    const key = keyGenerator(request)
    const result = store.check(config.endpoint, key, {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
    })

    if (!result.allowed) {
      const resetTimeSeconds = Math.ceil(result.resetTime / 1000)
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000)

      const response =
        config.onLimitExceeded?.(result.remaining, result.resetTime) ||
        NextResponse.json(
          {
            error: 'Rate limit exceeded',
            retryAfter,
          },
          { status: 429 }
        )

      // Add standard rate limit headers
      response.headers.set('X-RateLimit-Limit', String(result.limit))
      response.headers.set('X-RateLimit-Remaining', '0')
      response.headers.set('X-RateLimit-Reset', String(resetTimeSeconds))
      response.headers.set('Retry-After', String(retryAfter))

      return { allowed: false, response }
    }

    const resetTimeSeconds = Math.ceil(result.resetTime / 1000)

    return {
      allowed: true,
      remaining: result.remaining,
      resetTime: result.resetTime,
      limit: result.limit,
    }
  }
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  resetTime: number,
  limit: number
): NextResponse {
  const resetTimeSeconds = Math.ceil(resetTime / 1000)
  response.headers.set('X-RateLimit-Limit', String(limit))
  response.headers.set('X-RateLimit-Remaining', String(remaining))
  response.headers.set('X-RateLimit-Reset', String(resetTimeSeconds))
  return response
}

/**
 * Predefined endpoint configurations
 */
export const RATE_LIMIT_CONFIGS = {
  // Auth endpoints - very strict (brute force protection)
  auth: {
    endpoint: 'auth',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
  },
  authLogin: {
    endpoint: 'auth/login',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
  },
  authVerify: {
    endpoint: 'auth/verify',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
  },

  // Public endpoints - moderate limits
  health: {
    endpoint: 'health',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
  },
  metrics: {
    endpoint: 'metrics',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 50,
  },

  // Data endpoints - standard limits
  profiles: {
    endpoint: 'profiles',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  },
  meetings: {
    endpoint: 'meetings',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
  },
  alerts: {
    endpoint: 'alerts',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 40,
  },
  kanban: {
    endpoint: 'kanban',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  },

  // Service endpoints
  brain: {
    endpoint: 'brain',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 25,
  },
  conductor: {
    endpoint: 'conductor',
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 15,
  },
}
