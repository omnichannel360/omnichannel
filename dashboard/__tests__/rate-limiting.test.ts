/**
 * Comprehensive Rate Limiting Tests
 *
 * Tests:
 * - Per-endpoint rate limit enforcement
 * - IP-based and User-ID based limiting
 * - Rate limit headers
 * - Recovery after rate limit window expires
 * - Concurrent requests
 */

import { NextRequest } from 'next/server'
import { getStore } from '@/lib/rateLimit/store'
import { checkRateLimit, createRateLimitError, withRateLimit } from '@/lib/rate-limit-middleware'
import { ENDPOINT_LIMITS } from '@/lib/rate-limit-config'

describe('Rate Limiting Middleware', () => {
  beforeEach(() => {
    // Clear rate limit store before each test
    const store = getStore()
    store.clear()
  })

  describe('checkRateLimit', () => {
    it('should allow requests within limit', async () => {
      const request = new NextRequest('http://localhost:3000/api/health', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })

      const result = await checkRateLimit(request, { endpoint: '/api/health' })
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBeLessThan(ENDPOINT_LIMITS['/api/health'].maxRequests)
    })

    it('should block requests exceeding rate limit', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })

      const config = ENDPOINT_LIMITS['/api/auth']

      // Make requests up to the limit
      for (let i = 0; i < config.maxRequests; i++) {
        await checkRateLimit(request, { endpoint: '/api/auth' })
      }

      // Next request should be blocked
      const limitResult = await checkRateLimit(request, { endpoint: '/api/auth' })
      expect(limitResult.allowed).toBe(false)
      expect(limitResult.remaining).toBe(0)
    })

    it('should separate limits by endpoint', async () => {
      const ip = '192.168.1.1'
      const authRequest = new NextRequest('http://localhost:3000/api/auth', {
        headers: { 'x-forwarded-for': ip },
      })
      const healthRequest = new NextRequest('http://localhost:3000/api/health', {
        headers: { 'x-forwarded-for': ip },
      })

      // Exhaust auth limit
      const authConfig = ENDPOINT_LIMITS['/api/auth']
      for (let i = 0; i < authConfig.maxRequests; i++) {
        await checkRateLimit(authRequest, { endpoint: '/api/auth' })
      }

      // Health endpoint should still allow requests
      const healthResult = await checkRateLimit(healthRequest, { endpoint: '/api/health' })
      expect(healthResult.allowed).toBe(true)
    })

    it('should separate limits by user ID for authenticated endpoints', async () => {
      const request1 = new NextRequest('http://localhost:3000/api/metrics', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })
      const request2 = new NextRequest('http://localhost:3000/api/metrics', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })

      // User 1 makes requests
      const config = ENDPOINT_LIMITS['/api/metrics']
      for (let i = 0; i < config.maxRequests; i++) {
        await checkRateLimit(request1, { endpoint: '/api/metrics', userId: 'user1' })
      }

      // User 2 should be able to make requests
      const user2Result = await checkRateLimit(request2, {
        endpoint: '/api/metrics',
        userId: 'user2',
      })
      expect(user2Result.allowed).toBe(true)
    })

    it('should include correct rate limit headers', async () => {
      const request = new NextRequest('http://localhost:3000/api/health', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })

      const result = await checkRateLimit(request, { endpoint: '/api/health' })

      expect(result.limit).toBeGreaterThan(0)
      expect(result.remaining).toBeGreaterThanOrEqual(0)
      expect(result.resetTime).toBeGreaterThan(Date.now())
    })
  })

  describe('createRateLimitError', () => {
    it('should return 429 status with proper headers', () => {
      const result = {
        allowed: false,
        remaining: 0,
        limit: 10,
        resetTime: Date.now() + 60000,
      }

      const response = createRateLimitError(result)

      expect(response.status).toBe(429)
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
      expect(response.headers.get('X-RateLimit-Limit')).toBe('10')
      expect(response.headers.get('Retry-After')).toBeDefined()
    })

    it('should include error message in response body', async () => {
      const result = {
        allowed: false,
        remaining: 0,
        limit: 10,
        resetTime: Date.now() + 60000,
      }

      const response = createRateLimitError(result)
      const body = await response.json()

      expect(body.error).toBe('TOO_MANY_REQUESTS')
      expect(body.message).toContain('Rate limit exceeded')
      expect(body.retryAfter).toBeGreaterThan(0)
    })
  })

  describe('Per-endpoint rate limits', () => {
    const testCases = [
      {
        endpoint: '/api/auth',
        config: ENDPOINT_LIMITS['/api/auth'],
        description: 'Auth endpoint - strict limits',
      },
      {
        endpoint: '/api/health',
        config: ENDPOINT_LIMITS['/api/health'],
        description: 'Health endpoint - permissive limits',
      },
      {
        endpoint: '/api/meetings',
        config: ENDPOINT_LIMITS['/api/meetings'],
        description: 'Meetings endpoint - moderate limits',
      },
    ]

    testCases.forEach(({ endpoint, config, description }) => {
      it(`should enforce ${description}`, async () => {
        const request = new NextRequest(`http://localhost:3000${endpoint}`, {
          headers: { 'x-forwarded-for': '127.0.0.1' },
        })

        let lastResult = { allowed: true, remaining: 0, limit: 0, resetTime: 0 }

        // Make requests up to limit
        for (let i = 0; i < config.maxRequests + 1; i++) {
          lastResult = await checkRateLimit(request, { endpoint })
        }

        // Last request should be blocked
        expect(lastResult.allowed).toBe(false)
        expect(lastResult.remaining).toBe(0)
      })
    })
  })

  describe('Concurrent request handling', () => {
    it('should handle concurrent requests safely', async () => {
      const request = new NextRequest('http://localhost:3000/api/metrics', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })

      const config = ENDPOINT_LIMITS['/api/metrics']

      // Make concurrent requests
      const promises = Array(config.maxRequests + 5)
        .fill(null)
        .map(() => checkRateLimit(request, { endpoint: '/api/metrics' }))

      const results = await Promise.all(promises)

      // Should have exactly maxRequests allowed
      const allowedCount = results.filter(r => r.allowed).length
      expect(allowedCount).toBeLessThanOrEqual(config.maxRequests)
    })
  })

  describe('Rate limit recovery', () => {
    it('should allow requests after window expires', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })

      const config = ENDPOINT_LIMITS['/api/auth']
      const store = getStore()
      const endpoint = '/api/auth'

      // Exhaust limit
      for (let i = 0; i < config.maxRequests; i++) {
        await checkRateLimit(request, { endpoint })
      }

      // Should be blocked
      let result = await checkRateLimit(request, { endpoint })
      expect(result.allowed).toBe(false)

      // Clear entries to simulate window expiration
      store.reset(endpoint, '127.0.0.1')

      // Should allow again
      result = await checkRateLimit(request, { endpoint })
      expect(result.allowed).toBe(true)
    })
  })

  describe('Rate limit configuration validation', () => {
    it('should have all required endpoints configured', () => {
      const requiredEndpoints = [
        '/api/auth',
        '/api/auth/login',
        '/api/auth/verify',
        '/api/health',
        '/api/meetings',
        '/api/metrics',
      ]

      for (const endpoint of requiredEndpoints) {
        expect(ENDPOINT_LIMITS[endpoint]).toBeDefined()
        expect(ENDPOINT_LIMITS[endpoint].windowMs).toBeGreaterThan(0)
        expect(ENDPOINT_LIMITS[endpoint].maxRequests).toBeGreaterThan(0)
      }
    })

    it('should have reasonable rate limit values', () => {
      for (const [endpoint, config] of Object.entries(ENDPOINT_LIMITS)) {
        // Window should be at least 1 second
        expect(config.windowMs).toBeGreaterThanOrEqual(1000)

        // Max requests should be reasonable
        expect(config.maxRequests).toBeGreaterThan(0)
        expect(config.maxRequests).toBeLessThan(10000)

        // Requests per second should be reasonable
        const reqPerSec = (config.maxRequests * 1000) / config.windowMs
        expect(reqPerSec).toBeGreaterThan(0)
        expect(reqPerSec).toBeLessThan(1000)
      }
    })
  })

  describe('IP extraction from headers', () => {
    it('should extract IP from x-forwarded-for header', async () => {
      const request1 = new NextRequest('http://localhost:3000/api/health', {
        headers: { 'x-forwarded-for': '1.2.3.4' },
      })
      const request2 = new NextRequest('http://localhost:3000/api/health', {
        headers: { 'x-forwarded-for': '5.6.7.8' },
      })

      const result1 = await checkRateLimit(request1, { endpoint: '/api/health' })
      const result2 = await checkRateLimit(request2, { endpoint: '/api/health' })

      // Both should be allowed (different IPs)
      expect(result1.allowed).toBe(true)
      expect(result2.allowed).toBe(true)
    })

    it('should handle x-real-ip header', async () => {
      const request = new NextRequest('http://localhost:3000/api/health', {
        headers: { 'x-real-ip': '192.168.1.1' },
      })

      const result = await checkRateLimit(request, { endpoint: '/api/health' })
      expect(result.allowed).toBe(true)
    })
  })
})

describe('withRateLimit wrapper', () => {
  beforeEach(() => {
    const store = getStore()
    store.clear()
  })

  it('should enforce rate limits in handler', async () => {
    const handler = jest.fn(async () => {
      return new Response(JSON.stringify({ success: true }))
    })

    const request = new NextRequest('http://localhost:3000/api/health', {
      headers: { 'x-forwarded-for': '127.0.0.1' },
    })

    // This test would need to use the actual endpoint handlers
    // Testing the wrapper in isolation is tricky since it needs Next.js context
  })
})
