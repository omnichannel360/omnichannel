import { RateLimitRecord, RateLimitStore } from './rate-limit.types'

/**
 * In-memory rate limit store with automatic cleanup
 * Uses immutable updates and proper resource management
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private records: Map<string, RateLimitRecord> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null
  private readonly cleanupIntervalMs = 60000 // 1 minute

  constructor(private readonly windowMs: number) {
    this.startCleanup()
  }

  /**
   * Start automatic cleanup of expired records
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      const keysToDelete: string[] = []

      for (const [key, record] of this.records.entries()) {
        if (now > record.resetTime) {
          keysToDelete.push(key)
        }
      }

      keysToDelete.forEach((key) => this.records.delete(key))
    }, this.cleanupIntervalMs)

    // Prevent process from holding reference to this interval
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  /**
   * Increment counter for a key (immutable update)
   */
  async increment(key: string): Promise<RateLimitRecord> {
    const now = Date.now()
    const existing = this.records.get(key)

    // Create new record immutably
    const record: RateLimitRecord = existing
      ? // Reset if window expired
        now > existing.resetTime
        ? {
            count: 1,
            resetTime: now + this.windowMs,
            createdAt: now,
          }
        : // Increment without mutation
          {
            count: existing.count + 1,
            resetTime: existing.resetTime,
            createdAt: existing.createdAt,
          }
      : {
          count: 1,
          resetTime: now + this.windowMs,
          createdAt: now,
        }

    this.records.set(key, record)
    return record
  }

  /**
   * Get record for a key
   */
  async get(key: string): Promise<RateLimitRecord | null> {
    const record = this.records.get(key)
    const now = Date.now()

    // Return null if expired
    if (record && now > record.resetTime) {
      this.records.delete(key)
      return null
    }

    return record || null
  }

  /**
   * Reset counter for a key
   */
  async reset(key: string): Promise<void> {
    this.records.delete(key)
  }

  /**
   * Cleanup and destroy store
   */
  async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.records.clear()
  }

  /**
   * Get store size (for monitoring)
   */
  getSize(): number {
    return this.records.size
  }
}
