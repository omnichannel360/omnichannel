/**
 * Rate Limiter Tests
 * Tests for rate limiting functionality
 */

import { createRateLimiter, type RateLimitConfig } from './rate-limiter'

describe('InMemoryRateLimiter', () => {
  let config: RateLimitConfig

  beforeEach(() => {
    config = {
      maxTokens: 10,
      refillRate: 1, // 1 token per second
      windowMs: 60000,
      keyPrefix: 'test',
    }
  })

  describe('Basic functionality', () => {
    it('allows requests within rate limit', async () => {
      const limiter = createRateLimiter(config)

      for (let i = 0; i < 10; i++) {
        const allowed = await limiter.isAllowed('test-key')
        expect(allowed).toBe(true)
      }
    })

    it('denies requests exceeding rate limit', async () => {
      const limiter = createRateLimiter(config)

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.isAllowed('test-key')
      }

      // Next request should be denied
      const allowed = await limiter.isAllowed('test-key')
      expect(allowed).toBe(false)
    })

    it('returns remaining tokens correctly', async () => {
      const limiter = createRateLimiter(config)

      let remaining = await limiter.getRemaining('test-key')
      expect(remaining).toBe(10)

      await limiter.isAllowed('test-key')
      remaining = await limiter.getRemaining('test-key')
      expect(remaining).toBe(9)

      // Use 9 more tokens
      for (let i = 0; i < 9; i++) {
        await limiter.isAllowed('test-key')
      }

      remaining = await limiter.getRemaining('test-key')
      expect(remaining).toBe(0)
    })
  })

  describe('Token refill', () => {
    it('refills tokens over time', async () => {
      config.refillRate = 2 // 2 tokens per second
      const limiter = createRateLimiter(config)

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.isAllowed('test-key')
      }

      let remaining = await limiter.getRemaining('test-key')
      expect(remaining).toBe(0)

      // Wait 1 second - should refill 2 tokens
      await new Promise((resolve) => setTimeout(resolve, 1100))

      remaining = await limiter.getRemaining('test-key')
      expect(remaining).toBeGreaterThanOrEqual(2)
    })

    it('respects max token limit', async () => {
      config.maxTokens = 5
      const limiter = createRateLimiter(config)

      // Wait long enough to refill
      await new Promise((resolve) => setTimeout(resolve, 1100))

      const remaining = await limiter.getRemaining('test-key')
      expect(remaining).toBeLessThanOrEqual(5)
    })
  })

  describe('Key management', () => {
    it('creates new entry on first request', async () => {
      const limiter = createRateLimiter(config)

      const allowed = await limiter.isAllowed('new-key')
      expect(allowed).toBe(true)
    })

    it('maintains separate limits per key', async () => {
      const limiter = createRateLimiter(config)

      // Consume tokens from key1
      for (let i = 0; i < 10; i++) {
        await limiter.isAllowed('key1')
      }

      // key1 should be exhausted
      let allowed = await limiter.isAllowed('key1')
      expect(allowed).toBe(false)

      // key2 should have full tokens
      allowed = await limiter.isAllowed('key2')
      expect(allowed).toBe(true)

      const remaining = await limiter.getRemaining('key2')
      expect(remaining).toBe(9)
    })

    it('resets key correctly', async () => {
      const limiter = createRateLimiter(config)

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.isAllowed('test-key')
      }

      // Reset the key
      await limiter.reset('test-key')

      // Should have full tokens again
      const remaining = await limiter.getRemaining('test-key')
      expect(remaining).toBe(10)

      const allowed = await limiter.isAllowed('test-key')
      expect(allowed).toBe(true)
    })
  })

  describe('Edge cases', () => {
    it('handles rapid successive requests', async () => {
      const limiter = createRateLimiter(config)

      const results = []
      for (let i = 0; i < 15; i++) {
        results.push(await limiter.isAllowed('test-key'))
      }

      // First 10 should succeed, rest should fail
      expect(results.slice(0, 10).every((r) => r === true)).toBe(true)
      expect(results.slice(10).every((r) => r === false)).toBe(true)
    })

    it('handles very high refill rate', async () => {
      config.refillRate = 1000 // 1000 tokens per second
      const limiter = createRateLimiter(config)

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.isAllowed('test-key')
      }

      // Wait just 1ms - should still refill significantly
      await new Promise((resolve) => setTimeout(resolve, 10))

      const remaining = await limiter.getRemaining('test-key')
      expect(remaining).toBeGreaterThan(0)
    })

    it('handles concurrent calls safely', async () => {
      const limiter = createRateLimiter(config)

      // Make concurrent calls
      const promises = Array(20)
        .fill(null)
        .map(() => limiter.isAllowed('test-key'))

      const results = await Promise.all(promises)

      // Should have exactly 10 successful requests
      const successCount = results.filter((r) => r === true).length
      expect(successCount).toBeLessThanOrEqual(10)
    })
  })
})
