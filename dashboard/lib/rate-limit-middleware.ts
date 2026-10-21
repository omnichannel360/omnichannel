/**
 * Rate Limiting Middleware for Next.js API Routes
 * - Type-safe rate limiter integration
 * - Proper error handling and logging
 * - Cleanup on shutdown
 * - Per-endpoint configuration
 */

import { NextRequest, NextResponse } from 'next/server'
import * as jwt from 'jsonwebtoken'
import {
  RateLimiter,
  RateLimitConfig,
  RateLimitPresets,
  getClientIp,
  createRateLimitHeaders,
} from './rate-limiter'

// Get JWT secret from environment - matches auth.config.ts
// SECURITY: JWT_SECRET is REQUIRED for secure token verification
const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET

// SECURITY: Validate JWT_SECRET is configured in production
// CRITICAL: Startup fails if JWT_SECRET missing in production (prevent weak fallback security)
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'CRITICAL: JWT_SECRET or NEXTAUTH_SECRET not configured in production. ' +
      'Application cannot start. Ensure environment variables are set before deployment.'
    )
  } else {
    console.warn(
      'WARNING: JWT_SECRET or NEXTAUTH_SECRET not configured in development. ' +
      'JWT verification will skip signature validation (development only).'
    )
  }
}

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
 * Validate session cookie format AND signature
 * FIXED: Verifies JWT signatures to ensure cookie was issued by server
 * SECURITY FIX: NEVER accept bare UUID sessions - they can be forged
 *
 * SECURITY: Defense-in-depth
 * 1. Check JWT format (3 parts separated by dots)
 * 2. Verify JWT signature and expiration with JWT_SECRET
 * 3. Reject forged/tampered tokens
 * 4. Reject bare UUIDs (they have no cryptographic verification)
 */
function isValidSessionCookie(value: string): boolean {
  if (!value) return false

  // Maximum reasonable length (512 chars)
  if (value.length > 512) return false

  // Check format: JWT only (3 parts separated by dots)
  // SECURITY FIX: Do NOT accept bare UUIDs - they can be forged without verification
  const isJWTFormat = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  if (!isJWTFormat) {
    // Not valid JWT format - reject (including bare UUIDs)
    return false
  }

  // Verify JWT signature and expiration
  if (JWT_SECRET) {
    try {
      jwt.verify(value, JWT_SECRET)
      // Token is valid, properly signed, and not expired
      return true
    } catch (error) {
      // Token signature invalid, expired, or malformed
      // Examples: tampered with, signed with different key, expired
      return false
    }
  }

  // If no JWT_SECRET configured, accept format-only validation
  // (but log a warning in production)
  return isJWTFormat
}

/**
 * Extract user ID from request (from auth token or session)
 * SECURITY: Always validate/decode token before using for rate limiting
 * CRITICAL FIX: Never trust x-user-id header - it can be spoofed
 * CRITICAL FIX: Never use bare UUID as user ID - UUIDs can be forged
 * Only extract user ID from verified JWT with cryptographic signature
 */
function extractUserId(request: NextRequest): string | undefined {
  // Try to get from Authorization header (Bearer token)
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)

    // SECURITY: Verify JWT signature and extract authenticated user ID
    if (JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { sub?: string }
        if (decoded.sub) {
          return decoded.sub
        }
      } catch (error) {
        // Token invalid or expired - fall back to IP-based limiting
        return undefined
      }
    }
    return undefined
  }

  // Try to get from session cookie
  const sessionCookie = request.cookies.get('auth')
  if (sessionCookie?.value) {
    // SECURITY: Validate session cookie format and signature
    if (!isValidSessionCookie(sessionCookie.value)) {
      return undefined // Invalid format → fall back to IP-based limiting
    }

    // Extract user ID from JWT session cookie
    // SECURITY FIX: isValidSessionCookie now only accepts JWT format (not bare UUIDs)
    if (JWT_SECRET) {
      try {
        const decoded = jwt.verify(sessionCookie.value, JWT_SECRET) as { sub?: string }
        if (decoded.sub) {
          return decoded.sub
        }
      } catch {
        return undefined
      }
    }
  }

  return undefined
}

/**
 * Validate API key format with strict character whitelist
 * Prevents log injection and other security issues
 *
 * FIXED: Explicitly blocks:
 * - Control characters (newlines, tabs, etc)
 * - Unicode special characters that could break parsing
 * - Characters that cause encoding issues in logs
 */
function isValidApiKey(key: string): boolean {
  if (!key) return false

  // Minimum 12 characters
  if (key.length < 12) return false

  // Maximum 256 characters
  if (key.length > 256) return false

  // Strict whitelist: only alphanumeric, underscore, hyphen, dot
  // Explicitly does NOT allow: space, newline, tab, quotes, brackets, etc.
  // Regex: ^[a-zA-Z0-9._-]{12,256}$
  // This regex enforces the exact character set and length requirements
  return /^[a-zA-Z0-9._-]{12,256}$/.test(key)
}

/**
 * Extract API key from request
 */
function extractApiKey(request: NextRequest): string | undefined {
  // Try Authorization header with ApiKey scheme
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('ApiKey ')) {
    const key = authHeader.substring(7)

    // SECURITY: Validate API key format
    if (!isValidApiKey(key)) {
      return undefined // Invalid format → fall back to IP-based limiting
    }

    return key
  }

  // Try X-API-Key header
  const apiKeyHeader = request.headers.get('x-api-key')
  if (apiKeyHeader) {
    // SECURITY: Validate API key format
    if (!isValidApiKey(apiKeyHeader)) {
      return undefined
    }

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
