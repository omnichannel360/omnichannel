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

// SECURITY: Validate JWT_SECRET is configured
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error(
    'CRITICAL: JWT_SECRET or NEXTAUTH_SECRET not configured in production. ' +
    'JWT verification will fail. Ensure environment variables are set.'
  )
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
 * Accepts UUID (for legacy sessions) or cryptographically signed JWT
 *
 * SECURITY: Defense-in-depth
 * 1. Check format (UUID or JWT-like)
 * 2. If JWT: verify signature and expiration with JWT_SECRET
 * 3. Reject forged/tampered tokens
 */
function isValidSessionCookie(value: string): boolean {
  if (!value) return false

  // Maximum reasonable length (512 chars)
  if (value.length > 512) return false

  // Check format: UUID or JWT (3 parts separated by dots)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  if (isUUID) {
    // UUID format is acceptable for legacy/session token tracking
    return true
  }

  // For JWT format: verify signature and structure
  const isJWTFormat = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  if (!isJWTFormat) {
    // Not UUID, not valid JWT format
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
 * Only extract user ID from verified JWT or validated session cookie
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

    // For UUID-format sessions, cannot extract user ID without session lookup
    // For JWT sessions, extract the user ID from the token
    const isJWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(sessionCookie.value)
    if (isJWT && JWT_SECRET) {
      try {
        const decoded = jwt.verify(sessionCookie.value, JWT_SECRET) as { sub?: string }
        return decoded.sub
      } catch {
        return undefined
      }
    }

    // UUID-based sessions use the UUID itself as identifier
    return sessionCookie.value
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
  if (!/^[a-zA-Z0-9._-]{12,256}$/.test(key)) return false

  // Defense-in-depth: ensure no control characters or dangerous Unicode
  // Check for any character with code < 32 (control chars) or > 127 (extended)
  for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i)
    // Allow: 45-46 (-.), 48-57 (0-9), 65-90 (A-Z), 95 (_), 97-122 (a-z)
    if (
      code < 45 || // Below valid range
      (code > 46 && code < 48) || // Between . and 0
      (code > 57 && code < 65) || // Between 9 and A
      (code > 90 && code < 95) || // Between Z and _
      (code > 95 && code < 97) || // Between _ and a
      code > 122 // Above z
    ) {
      return false
    }
  }

  return true
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
