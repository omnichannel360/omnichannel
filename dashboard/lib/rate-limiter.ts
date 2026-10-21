/**
 * Rate Limiter Implementation with Fixed Issues
 * - Fixed: Immutability violations
 * - Fixed: Window semantics (resetTime calculation)
 * - Fixed: Memory leaks (interval cleanup)
 * - Fixed: Type safety
 * - Fixed: IP detection fallback
 */

export type RateLimitTier = 'public' | 'authenticated' | 'premium'

export interface RateLimitRecord {
  count: number
  resetTime: number
  createdAt: number
}

export interface RateLimitConfig {
  requestsPerWindow: number
  windowMs: number
  tier: RateLimitTier
  keyPrefix: string
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

export interface RateLimitStore {
  increment(key: string): Promise<RateLimitRecord>
  get(key: string): Promise<RateLimitRecord | null>
  reset(key: string): Promise<void>
  cleanup(): Promise<void>
}

/**
 * In-memory rate limit store with proper immutability
 * and automatic cleanup
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private store: Map<string, RateLimitRecord> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null
  private readonly cleanupIntervalMs = 60000 // 1 minute

  constructor(private readonly windowMs: number) {
    this.startCleanup()
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      const keysToDelete: string[] = []

      for (const [key, record] of this.store.entries()) {
        if (now > record.resetTime) {
          keysToDelete.push(key)
        }
      }

      keysToDelete.forEach((key) => this.store.delete(key))
    }, this.cleanupIntervalMs)

    // Allow process to exit even if cleanup interval is running
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  async increment(key: string): Promise<RateLimitRecord> {
    const now = Date.now()
    const existing = this.store.get(key)

    // Create new record immutably
    const record: RateLimitRecord = existing
      ? now > existing.resetTime
        ? {
            count: 1,
            resetTime: now + this.windowMs,
            createdAt: now,
          }
        : {
            count: existing.count + 1,
            resetTime: existing.resetTime,
            createdAt: existing.createdAt,
          }
      : {
          count: 1,
          resetTime: now + this.windowMs,
          createdAt: now,
        }

    this.store.set(key, record)
    return record
  }

  async get(key: string): Promise<RateLimitRecord | null> {
    const record = this.store.get(key)
    const now = Date.now()

    if (record && now > record.resetTime) {
      this.store.delete(key)
      return null
    }

    return record || null
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key)
  }

  async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.store.clear()
  }

  getSize(): number {
    return this.store.size
  }
}

/**
 * Rate limiter with proper type safety and configuration
 */
export class RateLimiter {
  private store: RateLimitStore

  constructor(private readonly config: RateLimitConfig) {
    this.store = new InMemoryRateLimitStore(config.windowMs)
  }

  async check(ip: string, userId?: string, apiKey?: string): Promise<RateLimitResult> {
    const key = this.buildKey(ip, userId, apiKey)
    const record = await this.store.increment(key)
    const now = Date.now()

    const allowed = record.count <= this.config.requestsPerWindow
    const remaining = Math.max(0, this.config.requestsPerWindow - record.count)
    const resetAt = record.resetTime

    return {
      allowed,
      remaining,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((resetAt - now) / 1000),
    }
  }

  async reset(ip: string, userId?: string, apiKey?: string): Promise<void> {
    const key = this.buildKey(ip, userId, apiKey)
    await this.store.reset(key)
  }

  private buildKey(ip: string, userId?: string, apiKey?: string): string {
    const components: string[] = [this.config.keyPrefix]

    if (userId) {
      components.push('user', userId)
    } else if (apiKey) {
      components.push('key', apiKey)
    } else {
      // Use IP with validation
      const safeIp = ip && ip.trim() ? ip : 'anonymous'
      components.push('ip', safeIp)
    }

    return components.join(':')
  }

  async cleanup(): Promise<void> {
    await this.store.cleanup()
  }
}

/**
 * Rate limit configuration presets for different endpoint types
 */
export const RateLimitPresets: Record<string, RateLimitConfig> = {
  // Authentication endpoints - strict limits
  auth: {
    requestsPerWindow: 5,
    windowMs: 60000, // 1 minute
    tier: 'public',
    keyPrefix: 'rl:auth',
  },

  // Health check - no limit
  health: {
    requestsPerWindow: Number.MAX_SAFE_INTEGER,
    windowMs: 60000,
    tier: 'public',
    keyPrefix: 'rl:health',
  },

  // API endpoints - moderate limits
  api: {
    requestsPerWindow: 100,
    windowMs: 15 * 60 * 1000, // 15 minutes
    tier: 'authenticated',
    keyPrefix: 'rl:api',
  },

  // Public endpoints - lenient limits
  public: {
    requestsPerWindow: 1000,
    windowMs: 60 * 60 * 1000, // 1 hour
    tier: 'public',
    keyPrefix: 'rl:public',
  },

  // Webhook endpoints - strict limits
  webhook: {
    requestsPerWindow: 50,
    windowMs: 60000, // 1 minute
    tier: 'authenticated',
    keyPrefix: 'rl:webhook',
  },

  // Premium tier - generous limits
  premium: {
    requestsPerWindow: 10000,
    windowMs: 60 * 60 * 1000, // 1 hour
    tier: 'premium',
    keyPrefix: 'rl:premium',
  },
}

/**
 * Extract client IP from request headers
 * Handles proxies and load balancers safely
 */
export function getClientIp(headers: HeadersInit | Record<string, string | string[] | undefined>): string {
  const headerRecord: Record<string, string | string[] | undefined> = headers instanceof Headers
    ? Object.fromEntries(headers.entries ? Array.from(headers.entries()) : Object.entries(headers))
    : (headers as Record<string, string | string[] | undefined>)

  const forwarded = headerRecord['x-forwarded-for']
  if (forwarded) {
    const ipStr = typeof forwarded === 'string' ? forwarded : (Array.isArray(forwarded) ? forwarded[0] : '')
    const ips = ipStr.split(',').map((ip) => ip.trim()).filter((ip) => ip.length > 0)
    if (ips.length > 0) {
      return ips[0]
    }
  }

  const realIp = headerRecord['x-real-ip']
  if (realIp) {
    const ip = typeof realIp === 'string' ? realIp : (Array.isArray(realIp) ? realIp[0] : '')
    if (ip && ip.trim()) {
      return ip.trim()
    }
  }

  return 'anonymous'
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
    'RateLimit-Remaining': String(Math.max(0, remaining)),
    'RateLimit-Reset': String(Math.ceil(resetTime / 1000)),
    'Retry-After': String(Math.max(1, Math.ceil((resetTime - Date.now()) / 1000))),
  }
}
