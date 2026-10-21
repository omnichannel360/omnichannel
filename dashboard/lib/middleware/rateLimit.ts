/**
 * Rate Limiting Middleware for Next.js
 * Applies rate limiting to API routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/rateLimit/store'
import type { RateLimitConfig } from '@/lib/rateLimit/store'

interface RateLimitOptions extends RateLimitConfig {
  endpoint?: string // Endpoint name for logging
  message?: string // Custom error message
  statusCode?: number // Custom status code
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
  return ip
}

/**
 * Extract user ID from request if authenticated
 */
function getUserId(request: NextRequest): string | null {
  try {
    // Check for authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null
    }

    // For now, we'll use a simple approach
    // In production, validate the token properly
    const token = authHeader.substring(7)
    if (token.length > 0) {
      // Hash the token to use as user identifier
      return `user:${Buffer.from(token).toString('base64').slice(0, 16)}`
    }
  } catch {
    // Silently fail and fall back to IP-based limiting
  }
  return null
}

/**
 * Create a rate limiting middleware
 */
export function createRateLimitMiddleware(options: RateLimitOptions) {
  const {
    windowMs = 60 * 1000, // 1 minute default
    maxRequests = 30,
    endpoint = 'unknown',
    message = 'Too many requests, please try again later.',
    statusCode = 429,
    keyGenerator = defaultKeyGenerator,
  } = options

  const store = getStore()

  return async (request: NextRequest) => {
    // Try user-based limiting first, fall back to IP-based
    let key = getUserId(request)
    if (!key) {
      key = keyGenerator(request)
    }

    const result = store.check(endpoint, key, {
      windowMs,
      maxRequests,
      keyGenerator,
    })

    // Create response with rate limit headers
    const response = new NextResponse(null, { status: 200 })

    response.headers.set('X-RateLimit-Limit', String(result.limit))
    response.headers.set('X-RateLimit-Remaining', String(result.remaining))
    response.headers.set(
      'X-RateLimit-Reset',
      String(Math.ceil(result.resetTime / 1000))
    )

    // If rate limit exceeded, return error
    if (!result.allowed) {
      const resetDate = new Date(result.resetTime)
      return NextResponse.json(
        {
          error: message,
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
          resetTime: resetDate.toISOString(),
        },
        {
          status: statusCode,
          headers: {
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000)),
            'Retry-After': String(Math.ceil((result.resetTime - Date.now()) / 1000)),
          },
        }
      )
    }

    // Allow request to continue
    return response
  }
}

/**
 * Predefined rate limit configurations
 */
export const RATE_LIMIT_CONFIGS = {
  // Strict limit for authentication endpoints
  auth: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
    message: 'Too many authentication attempts, please try again later.',
  },

  // Moderate limit for standard API endpoints
  standard: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    message: 'Too many requests, please try again later.',
  },

  // Generous limit for health checks
  health: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Health check limit exceeded.',
  },

  // Moderate limit for data operations
  data: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
    message: 'Too many data requests, please try again later.',
  },
}

/**
 * Rate limiting middleware wrapper for use in API routes
 */
export async function withRateLimit(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<NextResponse>,
  config: RateLimitOptions
) {
  const middleware = createRateLimitMiddleware(config)
  const rateLimitResponse = await middleware(request)

  // If rate limit check returned an error, return it
  if (rateLimitResponse.status !== 200) {
    return rateLimitResponse
  }

  // Otherwise, call the handler
  const response = await handler(request)

  // Copy rate limit headers from middleware response
  response.headers.set(
    'X-RateLimit-Limit',
    rateLimitResponse.headers.get('X-RateLimit-Limit') || ''
  )
  response.headers.set(
    'X-RateLimit-Remaining',
    rateLimitResponse.headers.get('X-RateLimit-Remaining') || ''
  )
  response.headers.set(
    'X-RateLimit-Reset',
    rateLimitResponse.headers.get('X-RateLimit-Reset') || ''
  )

  return response
}
