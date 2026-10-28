/**
 * In-Memory Rate Limiting Store
 * Tracks request counts per identifier (IP or User ID)
 * Auto-cleanup of expired entries
 */

interface RateLimitEntry {
  count: number
  resetTime: number
  firstRequestTime: number
}

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
  keyGenerator?: (request: Request) => string // Custom key generator
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

class RateLimitStore {
  private store: Map<string, Map<string, RateLimitEntry>> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Cleanup old entries every minute
    this.startCleanup()
  }

  private startCleanup() {
    if (typeof globalThis !== 'undefined' && typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => {
        this.cleanup()
      }, 60000) // Every 60 seconds
      // Housekeeping only: don't keep the process (or a Jest worker) alive for it
      this.cleanupInterval.unref?.()
    }
  }

  private cleanup() {
    const now = Date.now()
    for (const [endpoint, entries] of this.store.entries()) {
      const keysToDelete: string[] = []
      for (const [key, entry] of entries.entries()) {
        if (now > entry.resetTime) {
          keysToDelete.push(key)
        }
      }
      keysToDelete.forEach(key => entries.delete(key))
      if (entries.size === 0) {
        this.store.delete(endpoint)
      }
    }
  }

  /**
   * Check rate limit for a given key
   * Returns { allowed: boolean, remaining: number, resetTime: number }
   */
  check(
    endpoint: string,
    key: string,
    config: RateLimitConfig
  ): { allowed: boolean; remaining: number; resetTime: number; limit: number } {
    const now = Date.now()

    // Initialize endpoint store if needed
    if (!this.store.has(endpoint)) {
      this.store.set(endpoint, new Map())
    }

    const endpointStore = this.store.get(endpoint)!
    let entry = endpointStore.get(key)

    // Create new entry if doesn't exist or expired
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + config.windowMs,
        firstRequestTime: now,
      }
      endpointStore.set(key, entry)
    }

    // Increment counter
    const isAllowed = entry.count < config.maxRequests
    if (isAllowed) {
      entry.count++
    }

    return {
      allowed: isAllowed,
      remaining: Math.max(0, config.maxRequests - entry.count),
      limit: config.maxRequests,
      resetTime: entry.resetTime,
    }
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(endpoint: string, key: string) {
    const endpointStore = this.store.get(endpoint)
    if (endpointStore) {
      endpointStore.delete(key)
    }
  }

  /**
   * Clear all rate limit data
   */
  clear() {
    this.store.clear()
  }

  /**
   * Get stats for monitoring/debugging
   */
  getStats() {
    const stats: Record<string, number> = {}
    for (const [endpoint, entries] of this.store.entries()) {
      stats[endpoint] = entries.size
    }
    return stats
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.clear()
  }
}

// Singleton instance
let instance: RateLimitStore | null = null

export function getStore(): RateLimitStore {
  if (!instance) {
    instance = new RateLimitStore()
  }
  return instance
}

export { RateLimitStore }
export type { RateLimitConfig, RateLimitEntry }
