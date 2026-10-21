import { NextRequest, NextResponse } from 'next/server'

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number // milliseconds
  keyGenerator?: (request: NextRequest) => string
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

export interface RateLimitStore {
  key: string
  count: number
  resetTime: number
}

/**
 * In-memory rate limiting store with automatic cleanup
 */
class RateLimitMemoryStore {
  private store: Map<string, RateLimitStore> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Cleanup expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 60000)
  }

  /**
   * Increment counter for a key
   */
  increment(key: string, windowMs: number): RateLimitStore {
    const now = Date.now()
    const existing = this.store.get(key)

    if (!existing || now > existing.resetTime) {
      // Create new window
      const newEntry: RateLimitStore = {
        key,
        count: 1,
        resetTime: now + windowMs,
      }
      this.store.set(key, newEntry)
      return newEntry
    }

    // Increment existing window
    existing.count++
    return existing
  }

  /**
   * Get current count for a key
   */
  get(key: string): RateLimitStore | null {
    const entry = this.store.get(key)
    if (!entry) {
      return null
    }

    // Check if window has expired
    if (Date.now() > entry.resetTime) {
      this.store.delete(key)
      return null
    }

    return entry
  }

  /**
   * Reset a key
   */
  reset(key: string): void {
    this.store.delete(key)
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key)
      }
    }
  }

  /**
   * Destroy the store (stop cleanup interval)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.store.clear()
  }
}

// Global store instance
let globalStore: RateLimitMemoryStore | null = null

/**
 * Get or create the global rate limit store
 */
function getStore(): RateLimitMemoryStore {
  if (!globalStore) {
    globalStore = new RateLimitMemoryStore()
  }
  return globalStore
}

/**
 * Default key generator - uses IP address
 */
export function defaultKeyGenerator(request: NextRequest): string {
  const ip =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    request.ip ||
    'unknown'

  return `ip:${ip}`
}

/**
 * Generate key for authenticated requests (user-based rate limiting)
 */
export function userKeyGenerator(request: NextRequest): string {
  const userId = request.headers.get('x-user-id')
  if (userId) {
    return `user:${userId}`
  }

  return defaultKeyGenerator(request)
}

/**
 * Create a rate limiter function
 */
export function createRateLimiter(config: RateLimitConfig) {
  const {
    maxRequests,
    windowMs,
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = config

  return async (request: NextRequest): Promise<NextResponse | null> => {
    const key = keyGenerator(request)
    const store = getStore()
    const entry = store.increment(key, windowMs)

    // Calculate remaining requests
    const remaining = Math.max(0, maxRequests - entry.count)
    const resetTime = entry.resetTime

    // Add rate limit headers
    const headers = new Headers()
    headers.set('X-RateLimit-Limit', maxRequests.toString())
    headers.set('X-RateLimit-Remaining', remaining.toString())
    headers.set('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString())

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many requests, please try again later.',
        },
        {
          status: 429,
          headers,
        }
      )
    }

    return null
  }
}

/**
 * Endpoint-specific rate limiters
 */
export const rateLimiters = {
  // Auth endpoints - strict limit
  auth: createRateLimiter({
    maxRequests: 5,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: defaultKeyGenerator,
  }),

  // Login endpoint - very strict limit
  login: createRateLimiter({
    maxRequests: 5,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: defaultKeyGenerator,
  }),

  // Token verify - moderate limit
  verify: createRateLimiter({
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: defaultKeyGenerator,
  }),

  // Brain/AI endpoint - strict (expensive operation)
  brain: createRateLimiter({
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: userKeyGenerator,
  }),

  // Protected endpoints - moderate limit per user
  protected: createRateLimiter({
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: userKeyGenerator,
  }),

  // Alerts - moderate limit
  alerts: createRateLimiter({
    maxRequests: 50,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: userKeyGenerator,
  }),

  // Conductor - moderate limit
  conductor: createRateLimiter({
    maxRequests: 50,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: userKeyGenerator,
  }),

  // Kanban - moderate limit
  kanban: createRateLimiter({
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: userKeyGenerator,
  }),

  // Meetings - moderate limit
  meetings: createRateLimiter({
    maxRequests: 50,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: userKeyGenerator,
  }),

  // Metrics - moderate limit
  metrics: createRateLimiter({
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: userKeyGenerator,
  }),

  // Profiles - moderate limit
  profiles: createRateLimiter({
    maxRequests: 50,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: userKeyGenerator,
  }),

  // Health check - public endpoint with lenient limit
  // SECURITY: Health checks are public and used for monitoring/load balancing
  // Lenient rate limit to avoid blocking health checks during incidents
  health: createRateLimiter({
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: defaultKeyGenerator, // Rate limit by IP, not user
  }),
}

/**
 * Middleware wrapper for rate limiting
 */
export async function withRateLimit(
  request: NextRequest,
  limiter: ReturnType<typeof createRateLimiter>
): Promise<NextResponse | null> {
  return await limiter(request)
}
