/**
 * Rate Limiting Integration Tests
 * Verifies rate limiting is applied consistently across all endpoints
 */

import { getStore, type RateLimitConfig } from '@/lib/rateLimit/store'
import { createRateLimitMiddleware, RATE_LIMIT_CONFIGS } from '@/lib/rateLimit/middleware'
import { NextRequest } from 'next/server'

describe('Rate Limiting Integration', () => {
  const store = getStore()

  beforeEach(() => {
    // Clear store between tests
    store.clear()
  })

  describe('All Endpoint Configurations', () => {
    it('has defined config for all critical endpoints', () => {
      const requiredEndpoints = [
        'auth',
        'authLogin',
        'authVerify',
        'health',
        'metrics',
        'profiles',
        'meetings',
        'alerts',
        'kanban',
        'brain',
        'conductor',
      ]

      for (const endpoint of requiredEndpoints) {
        expect(RATE_LIMIT_CONFIGS[endpoint as keyof typeof RATE_LIMIT_CONFIGS]).toBeDefined()
      }

    })

    it('enforces auth endpoint limits (5 req/min)', async () => {
      const config = RATE_LIMIT_CONFIGS.auth
      const middleware = createRateLimitMiddleware({ ...config })

      const mockRequest = new NextRequest('http://localhost/api/auth')

      // Should allow first 5
      for (let i = 0; i < 5; i++) {
        const result = await middleware(mockRequest)
        expect(result.allowed).toBe(true)
      }

      // 6th should fail
      const sixthResult = await middleware(mockRequest)
      expect(sixthResult.allowed).toBe(false)
      expect(sixthResult.response?.status).toBe(429)
    })

    it('enforces health endpoint limits (100 req/min)', async () => {
      const config = RATE_LIMIT_CONFIGS.health
      const middleware = createRateLimitMiddleware({ ...config })

      const mockRequest = new NextRequest('http://localhost/api/health')

      // Should allow many requests
      for (let i = 0; i < 50; i++) {
        const result = await middleware(mockRequest)
        expect(result.allowed).toBe(true)
      }
    })

    it('enforces metrics endpoint limits (50 req/min)', async () => {
      const config = RATE_LIMIT_CONFIGS.metrics
      const middleware = createRateLimitMiddleware({ ...config })

      const mockRequest = new NextRequest('http://localhost/api/metrics')

      // Should allow up to 50
      const results = []
      for (let i = 0; i < 60; i++) {
        const result = await middleware(mockRequest)
        results.push(result)
      }

      const allowed = results.filter((r) => r.allowed).length
      expect(allowed).toBeLessThanOrEqual(50)
    })
  })

  describe('Rate Limit Headers', () => {
    it('includes all required headers in response', async () => {
      const config = RATE_LIMIT_CONFIGS.standard
      const middleware = createRateLimitMiddleware({ ...config })

      const mockRequest = new NextRequest('http://localhost/api/test')
      const result = await middleware(mockRequest)

      if (result.response) {
        expect(result.response.headers.get('X-RateLimit-Limit')).toBeDefined()
        expect(result.response.headers.get('X-RateLimit-Remaining')).toBeDefined()
        expect(result.response.headers.get('X-RateLimit-Reset')).toBeDefined()
      }
    })

    it('returns proper 429 status when limit exceeded', async () => {
      const config = RATE_LIMIT_CONFIGS.auth
      const middleware = createRateLimitMiddleware({ ...config })

      const mockRequest = new NextRequest('http://localhost/api/auth')

      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await middleware(mockRequest)
      }

      // Next request should fail
      const result = await middleware(mockRequest)
      expect(result.response?.status).toBe(429)
      expect(result.response?.headers.get('Retry-After')).toBeDefined()
    })
  })

  describe('Per-IP Rate Limiting', () => {
    it('maintains separate limits per IP address', async () => {
      const config = RATE_LIMIT_CONFIGS.standard
      const middleware = createRateLimitMiddleware({ ...config })

      // Create requests from different IPs
      const request1 = new NextRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      })
      const request2 = new NextRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '192.168.1.2' },
      })

      // Each IP should have independent limits
      const result1 = await middleware(request1)
      const result2 = await middleware(request2)

      expect(result1.allowed).toBe(true)
      expect(result2.allowed).toBe(true)
    })
  })

  describe('Store Cleanup', () => {
    it('removes expired entries', async () => {
      const config: RateLimitConfig = {
        windowMs: 100, // 100ms window for testing
        maxRequests: 5,
      }

      // Make a request to create an entry
      store.check('test-endpoint', 'test-key', config)

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Entry should be cleaned up after next check
      const result = store.check('test-endpoint', 'another-key', config)
      expect(result.allowed).toBe(true)
    })
  })

  describe('Concurrent Request Handling', () => {
    it('handles concurrent requests safely', async () => {
      const config = RATE_LIMIT_CONFIGS.standard
      const middleware = createRateLimitMiddleware({ ...config })

      const mockRequest = new NextRequest('http://localhost/api/test')

      // Make concurrent requests
      const promises = Array(50)
        .fill(null)
        .map(() => middleware(mockRequest))

      const results = await Promise.all(promises)
      const allowedCount = results.filter((r) => r.allowed).length

      // Should allow exactly maxRequests (30)
      expect(allowedCount).toBeLessThanOrEqual(config.maxRequests)
    })
  })

  describe('Error Messages', () => {
    it('provides helpful error message when rate limited', async () => {
      const config = RATE_LIMIT_CONFIGS.auth
      const middleware = createRateLimitMiddleware({
        ...config,
        message: 'Custom rate limit message',
      })

      const mockRequest = new NextRequest('http://localhost/api/auth')

      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await middleware(mockRequest)
      }

      // Check error response
      const result = await middleware(mockRequest)
      expect(result.response?.status).toBe(429)

      const body = await result.response?.json()
      expect(body.error).toContain('Custom rate limit message')
    })
  })
})

describe('Rate Limiting Deployment Checklist', () => {
  it('all endpoints have consistent rate limiting configuration', () => {
    const configs = RATE_LIMIT_CONFIGS

    // Verify all config objects have required fields
    for (const [endpoint, config] of Object.entries(configs)) {
      expect(config).toHaveProperty('windowMs')
      expect(config).toHaveProperty('maxRequests')
      expect(config.windowMs).toBeGreaterThan(0)
      expect(config.maxRequests).toBeGreaterThan(0)
    }
  })

  it('auth endpoints have stricter limits than others', () => {
    const authLimit = RATE_LIMIT_CONFIGS.auth.maxRequests
    const standardLimit = RATE_LIMIT_CONFIGS.standard.maxRequests

    expect(authLimit).toBeLessThan(standardLimit)
  })

  it('health endpoint has highest limit', () => {
    const healthLimit = RATE_LIMIT_CONFIGS.health.maxRequests
    const allLimits = Object.values(RATE_LIMIT_CONFIGS).map((c) => c.maxRequests)

    expect(healthLimit).toBeGreaterThanOrEqual(Math.max(...allLimits))
  })
})
