/**
 * Rate Limiter Implementation
 * Supports token bucket and sliding window algorithms
 */

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  message?: string
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

export interface RateLimitStore {
  increment(key: string): Promise<number>
  reset(key: string): Promise<void>
  get(key: string): Promise<number | null>
}

/**
 * In-memory rate limit store
 * Suitable for single-server deployments
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private store: Map<string, { count: number; resetTime: number }> = new Map()

  async increment(key: string): Promise<number> {
    const now = Date.now()
    const record = this.store.get(key)

    if (!record || now > record.resetTime) {
      // Reset window
      this.store.set(key, { count: 1, resetTime: now + 60000 })
      return 1
    }

    record.count++
    return record.count
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key)
  }

  async get(key: string): Promise<number | null> {
    const record = this.store.get(key)
    if (!record) return null

    const now = Date.now()
    if (now > record.resetTime) {
      this.store.delete(key)
      return null
    }

    return record.count
  }

  // Cleanup expired entries every minute
  startCleanup(): void {
    setInterval(() => {
      const now = Date.now()
      for (const [key, record] of this.store.entries()) {
        if (now > record.resetTime) {
          this.store.delete(key)
        }
      }
    }, 60000)
  }
}

/**
 * Token Bucket Rate Limiter
 * Allows burst traffic while maintaining average rate limit
 */
export class TokenBucketRateLimiter {
  private config: RateLimitConfig
  private store: RateLimitStore

  constructor(config: RateLimitConfig, store: RateLimitStore) {
    this.config = config
    this.store = store
  }

  /**
   * Generate rate limit key from request metadata
   */
  generateKey(
    ip: string,
    endpoint: string,
    userId?: string
  ): string {
    if (userId) {
      return `rate-limit:${endpoint}:${userId}`
    }
    return `rate-limit:${endpoint}:${ip}`
  }

  /**
   * Check if request is within rate limit
   */
  async isAllowed(key: string): Promise<{
    allowed: boolean
    remaining: number
    resetTime: number
  }> {
    const count = await this.store.increment(key)
    const remaining = Math.max(0, this.config.maxRequests - count)
    const resetTime = Date.now() + this.config.windowMs

    return {
      allowed: count <= this.config.maxRequests,
      remaining,
      resetTime,
    }
  }

  /**
   * Get current count for a key
   */
  async getCount(key: string): Promise<number> {
    const count = await this.store.get(key)
    return count || 0
  }

  /**
   * Reset rate limit for a key
   */
  async resetKey(key: string): Promise<void> {
    await this.store.reset(key)
  }
}

/**
 * Rate limit configuration presets for different endpoint types
 */
export const RateLimitPresets = {
  // Authentication endpoints - strict limits
  auth: {
    maxRequests: 5,
    windowMs: 60000, // 1 minute
    message: 'Too many authentication attempts, please try again later',
  } as RateLimitConfig,

  // Health check - no limit
  health: {
    maxRequests: Number.MAX_SAFE_INTEGER,
    windowMs: 60000,
    message: 'Rate limit exceeded',
  } as RateLimitConfig,

  // API endpoints - moderate limits
  api: {
    maxRequests: 100,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: 'Too many requests, please try again later',
  } as RateLimitConfig,

  // Public endpoints - lenient limits
  public: {
    maxRequests: 1000,
    windowMs: 60 * 60 * 1000, // 1 hour
    message: 'Rate limit exceeded',
  } as RateLimitConfig,

  // Webhook endpoints - strict limits
  webhook: {
    maxRequests: 50,
    windowMs: 60000, // 1 minute
    message: 'Webhook rate limit exceeded',
  } as RateLimitConfig,
}

/**
 * Extract client IP from request
 * Handles proxies and load balancers
 */
export function getClientIp(headers: Record<string, string | string[] | undefined>): string {
  const forwarded = headers['x-forwarded-for']
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')
    return ips[0].trim()
  }

  const realIp = headers['x-real-ip']
  if (realIp) {
    return typeof realIp === 'string' ? realIp : realIp[0]
  }

  return 'unknown'
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(
  remaining: number,
  resetTime: number,
  limit: number
): Record<string, string> {
  return {
    'RateLimit-Limit': String(limit),
    'RateLimit-Remaining': String(remaining),
    'RateLimit-Reset': String(Math.ceil(resetTime / 1000)),
    'Retry-After': String(Math.ceil((resetTime - Date.now()) / 1000)),
  }
}
