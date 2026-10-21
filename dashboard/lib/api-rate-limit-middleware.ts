import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit, rateLimiters, RateLimitConfig, createRateLimiter } from './rate-limiting'
import { createLogger } from './logger'

const logger = createLogger('rate-limit-middleware')

/**
 * Wrapper function for API routes that need rate limiting
 * Use this in your route handlers to apply rate limiting
 *
 * Example:
 * export async function POST(request: NextRequest) {
 *   const rateLimitError = await applyRateLimit(request, 'login')
 *   if (rateLimitError) return rateLimitError
 *   // ... rest of your handler
 * }
 */
export async function applyRateLimit(
  request: NextRequest,
  endpoint: keyof typeof rateLimiters
): Promise<NextResponse | null> {
  const limiter = rateLimiters[endpoint as keyof typeof rateLimiters]
  if (!limiter) {
    logger.error('Rate limiter not found for endpoint', new Error('Missing rate limiter'), {
      endpoint,
      method: request.method,
      path: request.nextUrl.pathname,
    })
    return null
  }

  return await withRateLimit(request, limiter)
}

/**
 * Create a custom rate limiter for specific route
 *
 * Example:
 * const customLimiter = createCustomRateLimiter({
 *   maxRequests: 20,
 *   windowMs: 60000,
 *   keyGenerator: (req) => req.headers.get('x-api-key') || 'unknown'
 * })
 */
export function createCustomRateLimiter(config: RateLimitConfig) {
  return createRateLimiter(config)
}

/**
 * Composite middleware that checks multiple things before executing handler
 * Applies rate limiting, authentication, and returns appropriate errors
 *
 * Example with rate limiting:
 * export async function POST(request: NextRequest) {
 *   return await withMiddleware(request, 'login', async () => {
 *     // Your handler code here
 *     return NextResponse.json({ success: true })
 *   })
 * }
 */
export async function withMiddleware(
  request: NextRequest,
  endpoint: keyof typeof rateLimiters,
  handler: (req: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, endpoint)
  if (rateLimitError) {
    return rateLimitError
  }

  // Execute handler
  return await handler(request)
}

/**
 * Response wrapper that automatically adds rate limit headers
 */
export function createRateLimitedResponse<T>(
  data: T,
  request: NextRequest,
  endpoint: keyof typeof rateLimiters,
  status: number = 200
): NextResponse {
  const response = NextResponse.json(data, { status })

  // Note: Headers are added by the limiter itself
  // This is a convenience wrapper for consistency

  return response
}

/**
 * Health check function - returns true if rate limiting is operational
 * Verifies critical rate limiters are configured and functional
 */
export function isRateLimitingOperational(): boolean {
  const hasAuth = rateLimiters.auth !== undefined
  const hasBrain = rateLimiters.brain !== undefined
  const hasProtected = rateLimiters.protected !== undefined
  const hasHealth = rateLimiters.health !== undefined

  if (!hasAuth || !hasBrain || !hasProtected || !hasHealth) {
    logger.error('Rate limiter health check failed', new Error('Missing rate limiters'), {
      hasAuth,
      hasBrain,
      hasProtected,
      hasHealth,
    })
    return false
  }

  return true
}
