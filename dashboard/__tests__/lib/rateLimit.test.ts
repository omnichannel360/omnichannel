/**
 * Rate Limiting Tests
 * Comprehensive test coverage for rate limiting functionality
 */

import { getStore, RateLimitStore } from '@/lib/rateLimit/store'
import { createRateLimitMiddleware, RATE_LIMIT_CONFIGS, withRateLimit } from '@/lib/middleware/rateLimit'
import { NextRequest, NextResponse } from 'next/server'

describe('RateLimitStore', () => {
  let store: RateLimitStore

  beforeEach(() => {
    store = new RateLimitStore()
  })

  afterEach(() => {
    store.destroy()
  })

  describe('check', () => {
    it('should allow requests under limit', () => {
      const config = { windowMs: 60000, maxRequests: 5 }
      const result = store.check('api/test', 'ip:127.0.0.1', config)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4)
      expect(result.limit).toBe(5)
    })

    it('should track multiple requests', () => {
      const config = { windowMs: 60000, maxRequests: 3 }
      const endpoint = 'api/test'
      const key = 'ip:127.0.0.1'

      const r1 = store.check(endpoint, key, config)
      expect(r1.allowed).toBe(true)
      expect(r1.remaining).toBe(2)

      const r2 = store.check(endpoint, key, config)
      expect(r2.allowed).toBe(true)
      expect(r2.remaining).toBe(1)

      const r3 = store.check(endpoint, key, config)
      expect(r3.allowed).toBe(true)
      expect(r3.remaining).toBe(0)

      const r4 = store.check(endpoint, key, config)
      expect(r4.allowed).toBe(false)
      expect(r4.remaining).toBe(0)
    })

    it('should block requests exceeding limit', () => {
      const config = { windowMs: 60000, maxRequests: 2 }
      store.check('api/test', 'ip:192.168.1.1', config)
      store.check('api/test', 'ip:192.168.1.1', config)

      const result = store.check('api/test', 'ip:192.168.1.1', config)
      expect(result.allowed).toBe(false)
    })

    it('should reset after window expires', (done) => {
      const config = { windowMs: 100, maxRequests: 1 }
      const endpoint = 'api/test'
      const key = 'ip:10.0.0.1'

      const r1 = store.check(endpoint, key, config)
      expect(r1.allowed).toBe(true)

      const r2 = store.check(endpoint, key, config)
      expect(r2.allowed).toBe(false)

      setTimeout(() => {
        const r3 = store.check(endpoint, key, config)
        expect(r3.allowed).toBe(true)
        done()
      }, 150)
    })

    it('should handle different endpoints separately', () => {
      const config = { windowMs: 60000, maxRequests: 2 }
      const key = 'ip:127.0.0.1'

      const r1 = store.check('api/endpoint1', key, config)
      const r2 = store.check('api/endpoint2', key, config)

      expect(r1.allowed).toBe(true)
      expect(r2.allowed).toBe(true)

      const r3 = store.check('api/endpoint1', key, config)
      expect(r3.allowed).toBe(true)

      const r4 = store.check('api/endpoint1', key, config)
      expect(r4.allowed).toBe(false)

      const r5 = store.check('api/endpoint2', key, config)
      expect(r5.allowed).toBe(true) // Different endpoint still has quota
    })

    it('should handle different keys separately', () => {
      const config = { windowMs: 60000, maxRequests: 1 }

      const r1 = store.check('api/test', 'ip:192.168.1.1', config)
      expect(r1.allowed).toBe(true)

      const r2 = store.check('api/test', 'ip:192.168.1.2', config)
      expect(r2.allowed).toBe(true) // Different IP has own quota
    })

    it('should return correct resetTime', () => {
      const windowMs = 5000
      const config = { windowMs, maxRequests: 5 }
      const before = Date.now()

      const result = store.check('api/test', 'ip:127.0.0.1', config)

      expect(result.resetTime).toBeGreaterThanOrEqual(before + windowMs)
      expect(result.resetTime).toBeLessThanOrEqual(before + windowMs + 100)
    })
  })

  describe('reset', () => {
    it('should reset rate limit for a specific key', () => {
      const config = { windowMs: 60000, maxRequests: 2 }

      store.check('api/test', 'ip:127.0.0.1', config)
      store.check('api/test', 'ip:127.0.0.1', config)

      const blocked = store.check('api/test', 'ip:127.0.0.1', config)
      expect(blocked.allowed).toBe(false)

      store.reset('api/test', 'ip:127.0.0.1')

      const allowed = store.check('api/test', 'ip:127.0.0.1', config)
      expect(allowed.allowed).toBe(true)
    })
  })

  describe('clear', () => {
    it('should clear all rate limit data', () => {
      const config = { windowMs: 60000, maxRequests: 2 }

      store.check('api/test', 'ip:127.0.0.1', config)
      store.check('api/test', 'ip:127.0.0.1', config)

      store.clear()

      const result = store.check('api/test', 'ip:127.0.0.1', config)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(1)
    })
  })

  describe('getStats', () => {
    it('should return endpoint stats', () => {
      const config = { windowMs: 60000, maxRequests: 5 }

      store.check('api/endpoint1', 'ip:127.0.0.1', config)
      store.check('api/endpoint2', 'ip:127.0.0.1', config)

      const stats = store.getStats()
      expect(stats['api/endpoint1']).toBe(1)
      expect(stats['api/endpoint2']).toBe(1)
    })
  })
})

describe('createRateLimitMiddleware', () => {
  let store: RateLimitStore

  beforeEach(() => {
    store = getStore()
    store.clear()
  })

  it('should create valid middleware function', () => {
    const middleware = createRateLimitMiddleware({
      windowMs: 60000,
      maxRequests: 5,
      endpoint: 'api/test',
    })

    expect(typeof middleware).toBe('function')
  })
})

describe('RATE_LIMIT_CONFIGS', () => {
  it('should export auth config', () => {
    expect(RATE_LIMIT_CONFIGS.auth).toBeDefined()
    expect(RATE_LIMIT_CONFIGS.auth.maxRequests).toBe(5)
  })

  it('should export standard config', () => {
    expect(RATE_LIMIT_CONFIGS.standard).toBeDefined()
    expect(RATE_LIMIT_CONFIGS.standard.maxRequests).toBe(30)
  })

  it('should export health config', () => {
    expect(RATE_LIMIT_CONFIGS.health).toBeDefined()
    expect(RATE_LIMIT_CONFIGS.health.maxRequests).toBe(100)
  })

  it('should export data config', () => {
    expect(RATE_LIMIT_CONFIGS.data).toBeDefined()
    expect(RATE_LIMIT_CONFIGS.data.maxRequests).toBe(20)
  })
})

describe('Singleton instance', () => {
  it('should return same instance', () => {
    const store1 = getStore()
    const store2 = getStore()
    expect(store1).toBe(store2)
  })
})
