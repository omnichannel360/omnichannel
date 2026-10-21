/**
 * Comprehensive Rate Limiter Tests (TDD)
 * RED phase: All tests fail until implementation is complete
 */

import {
  RateLimiter,
  InMemoryRateLimitStore,
  getClientIp,
  createRateLimitHeaders,
  RateLimitPresets,
} from './rate-limiter'

describe('RateLimiter - Immutable Updates & Type Safety', () => {
  let rateLimiter: RateLimiter

  beforeEach(() => {
    rateLimiter = new RateLimiter(RateLimitPresets.api)
  })

  afterEach(async () => {
    await rateLimiter.cleanup()
  })

  describe('Basic Rate Limiting (RED)', () => {
    it('should allow requests within limit', async () => {
      const result = await rateLimiter.check('192.168.1.1')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(99) // 100 - 1
    })

    it('should block requests exceeding limit', async () => {
      const config = RateLimitPresets.auth
      const limiter = new RateLimiter(config)

      // Make requests up to the limit
      for (let i = 0; i < config.requestsPerWindow; i++) {
        const result = await limiter.check('192.168.1.1')
        expect(result.allowed).toBe(true)
      }

      // Next request should be blocked
      const result = await limiter.check('192.168.1.1')
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfter).toBeDefined()

      await limiter.cleanup()
    })

    it('should track remaining requests correctly', async () => {
      let result = await rateLimiter.check('192.168.1.1')
      expect(result.remaining).toBe(99)

      result = await rateLimiter.check('192.168.1.1')
      expect(result.remaining).toBe(98)

      result = await rateLimiter.check('192.168.1.1')
      expect(result.remaining).toBe(97)
    })
  })

  describe('Concurrent Requests', () => {
    it('should handle concurrent requests from same IP correctly', async () => {
      const config = RateLimitPresets.auth
      const limiter = new RateLimiter(config)

      // Send concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        limiter.check('192.168.1.1')
      )

      const results = await Promise.all(promises)

      // Verify all incremented the counter
      expect(results.some((r) => r.remaining === 0)).toBe(false)
      expect(results[results.length - 1].remaining).toBeLessThan(
        results[0].remaining
      )

      await limiter.cleanup()
    })

    it('should isolate limits between different IPs', async () => {
      const config = RateLimitPresets.auth
      const limiter = new RateLimiter(config)

      // Fill limit for IP1
      for (let i = 0; i < config.requestsPerWindow; i++) {
        await limiter.check('192.168.1.1')
      }

      // IP2 should still be allowed
      const result = await limiter.check('192.168.1.2')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(config.requestsPerWindow - 1)

      await limiter.cleanup()
    })
  })

  describe('Tier Enforcement', () => {
    it('should enforce public tier limits', async () => {
      const limiter = new RateLimiter(RateLimitPresets.public)

      let result = await limiter.check('192.168.1.1')
      expect(result.allowed).toBe(true)

      // Exhaust the limit
      for (let i = 1; i < RateLimitPresets.public.requestsPerWindow; i++) {
        result = await limiter.check('192.168.1.1')
      }

      // Next should fail
      result = await limiter.check('192.168.1.1')
      expect(result.allowed).toBe(false)

      await limiter.cleanup()
    })

    it('should use user ID over IP when both present', async () => {
      const limiter = new RateLimiter(RateLimitPresets.api)
      const userId = 'user-123'

      // Same user from different IPs
      const result1 = await limiter.check('192.168.1.1', userId)
      const result2 = await limiter.check('192.168.1.2', userId)

      // Should share the same limit
      expect(result1.remaining).toBe(99)
      expect(result2.remaining).toBe(98)

      await limiter.cleanup()
    })

    it('should use API key over IP when present', async () => {
      const limiter = new RateLimiter(RateLimitPresets.api)
      const apiKey = 'sk-test-123'

      const result1 = await limiter.check('192.168.1.1', undefined, apiKey)
      const result2 = await limiter.check('192.168.1.2', undefined, apiKey)

      expect(result1.remaining).toBe(99)
      expect(result2.remaining).toBe(98)

      await limiter.cleanup()
    })
  })

  describe('Window Reset (Fixed Window Semantics)', () => {
    it('should reset counter after window expires', async () => {
      jest.useFakeTimers()

      const limiter = new RateLimiter({
        ...RateLimitPresets.auth,
        windowMs: 1000, // 1 second window
      })

      // Use up the limit
      for (let i = 0; i < RateLimitPresets.auth.requestsPerWindow; i++) {
        await limiter.check('192.168.1.1')
      }

      let result = await limiter.check('192.168.1.1')
      expect(result.allowed).toBe(false)

      // Advance time past the window
      jest.advanceTimersByTime(1100)

      result = await limiter.check('192.168.1.1')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4) // Reset to limit - 1

      jest.useRealTimers()
      await limiter.cleanup()
    })

    it('should calculate resetAt correctly without recalculation', async () => {
      jest.useFakeTimers()
      const now = Date.now()
      jest.setSystemTime(now)

      const windowMs = 60000
      const limiter = new RateLimiter({
        ...RateLimitPresets.api,
        windowMs,
      })

      const result = await limiter.check('192.168.1.1')

      expect(result.resetAt).toBe(now + windowMs)

      // Make another request in the same window
      jest.advanceTimersByTime(1000)
      const result2 = await limiter.check('192.168.1.1')

      // resetAt should not change within the same window
      expect(result2.resetAt).toBe(now + windowMs)

      jest.useRealTimers()
      await limiter.cleanup()
    })
  })

  describe('Storage Cleanup (Memory Leak Prevention)', () => {
    it('should clean up expired records automatically', async () => {
      jest.useFakeTimers()

      const windowMs = 1000
      const store = new InMemoryRateLimitStore(windowMs)

      // Create record
      await store.increment('test-key')
      expect(store.getSize()).toBe(1)

      // Advance past cleanup interval
      jest.advanceTimersByTime(70000) // 70 seconds

      // Size should be 0 after cleanup
      expect(store.getSize()).toBe(0)

      jest.useRealTimers()
      await store.cleanup()
    })

    it('should return null for expired records', async () => {
      jest.useFakeTimers()

      const windowMs = 1000
      const store = new InMemoryRateLimitStore(windowMs)

      await store.increment('test-key')

      // Advance past window
      jest.advanceTimersByTime(1100)

      const record = await store.get('test-key')
      expect(record).toBeNull()

      jest.useRealTimers()
      await store.cleanup()
    })

    it('should cleanup interval reference on destruction', async () => {
      const store = new InMemoryRateLimitStore(1000)
      await store.cleanup()
      // Process should be able to exit even if we don't hold the interval
      expect(store.getSize()).toBe(0)
    })
  })

  describe('Reset', () => {
    it('should reset rate limit for a client', async () => {
      // Use up the limit
      for (let i = 0; i < RateLimitPresets.api.requestsPerWindow; i++) {
        await rateLimiter.check('192.168.1.1')
      }

      let result = await rateLimiter.check('192.168.1.1')
      expect(result.allowed).toBe(false)

      // Reset
      await rateLimiter.reset('192.168.1.1')

      // Should be allowed again
      result = await rateLimiter.check('192.168.1.1')
      expect(result.allowed).toBe(true)
    })
  })

  describe('Immutability (No Mutations)', () => {
    it('should not mutate existing records', async () => {
      const store = new InMemoryRateLimitStore(60000)

      const record1 = await store.increment('test-key')
      const count1 = record1.count

      const record2 = await store.increment('test-key')
      const count2 = record2.count

      // Count should increment immutably
      expect(count2).toBe(count1 + 1)
      expect(record1.count).toBe(count1) // Original not mutated

      await store.cleanup()
    })
  })
})

describe('getClientIp - IP Detection Fallback', () => {
  it('should extract IP from x-forwarded-for header', () => {
    const headers = {
      'x-forwarded-for': '203.0.113.1, 198.51.100.2',
    }
    const ip = getClientIp(headers)
    expect(ip).toBe('203.0.113.1')
  })

  it('should extract IP from x-real-ip header', () => {
    const headers = {
      'x-real-ip': '203.0.113.1',
    }
    const ip = getClientIp(headers)
    expect(ip).toBe('203.0.113.1')
  })

  it('should prefer x-forwarded-for over x-real-ip', () => {
    const headers = {
      'x-forwarded-for': '203.0.113.1',
      'x-real-ip': '198.51.100.1',
    }
    const ip = getClientIp(headers)
    expect(ip).toBe('203.0.113.1')
  })

  it('should return anonymous for missing headers (safe fallback)', () => {
    const headers = {}
    const ip = getClientIp(headers)
    expect(ip).toBe('anonymous')
  })

  it('should handle array format headers', () => {
    const headers = {
      'x-forwarded-for': ['203.0.113.1', '198.51.100.2'],
    }
    const ip = getClientIp(headers)
    expect(ip).toBe('203.0.113.1')
  })

  it('should trim whitespace from IPs', () => {
    const headers = {
      'x-forwarded-for': '  203.0.113.1  , 198.51.100.2',
    }
    const ip = getClientIp(headers)
    expect(ip).toBe('203.0.113.1')
  })
})

describe('createRateLimitHeaders - Proper Header Generation', () => {
  it('should create correct headers', () => {
    const resetTime = Date.now() + 60000
    const headers = createRateLimitHeaders(50, resetTime, 100)

    expect(headers['RateLimit-Limit']).toBe('100')
    expect(headers['RateLimit-Remaining']).toBe('50')
    expect(headers['RateLimit-Reset']).toBeDefined()
    expect(headers['Retry-After']).toBeDefined()
  })

  it('should handle zero remaining', () => {
    const resetTime = Date.now() + 60000
    const headers = createRateLimitHeaders(0, resetTime, 100)

    expect(headers['RateLimit-Remaining']).toBe('0')
  })

  it('should never return negative remaining', () => {
    const resetTime = Date.now() + 60000
    const headers = createRateLimitHeaders(-10, resetTime, 100)

    expect(parseInt(headers['RateLimit-Remaining'])).toBeGreaterThanOrEqual(0)
  })
})
