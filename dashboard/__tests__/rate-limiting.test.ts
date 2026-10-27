/**
 * Comprehensive Rate Limiting Tests
 *
 * Tests:
 * - Per-endpoint rate limit enforcement
 * - IP-based and User-ID based limiting
 * - Rate limit headers
 * - Recovery after rate limit window expires
 * - Concurrent requests
 *
 * Targets the store-backed middleware used by the API routes
 * (lib/rateLimit/middleware.ts + lib/rateLimit/store.ts), driven by the
 * per-endpoint limits declared in lib/rate-limit-config.ts (ENDPOINT_LIMITS).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/rateLimit/store'
import { createRateLimitMiddleware, userKeyGenerator } from '@/lib/rateLimit/middleware'
import { withRateLimit } from '@/lib/middleware/rateLimit'
import { ENDPOINT_LIMITS } from '@/lib/rate-limit-config'

type CheckResult = Awaited<ReturnType<ReturnType<typeof createRateLimitMiddleware>>>

/**
 * Run one rate limit check for `endpoint` using its ENDPOINT_LIMITS spec.
 * Authenticated callers are keyed by user ID, anonymous callers by IP.
 */
async function checkRateLimit(
  request: NextRequest,
  { endpoint, userId }: { endpoint: string; userId?: string }
): Promise<CheckResult> {
  const spec = ENDPOINT_LIMITS[endpoint]
  const middleware = createRateLimitMiddleware({
    endpoint,
    windowMs: spec.windowMs,
    maxRequests: spec.maxRequests,
    getKey: userId ? userKeyGenerator(userId) : undefined,
  })
  return middleware(request)
}

/** Make `count` checks and return the last result */
async function exhaust(
  request: NextRequest,
  options: { endpoint: string; userId?: string },
  count: number
): Promise<CheckResult | undefined> {
  let last: CheckResult | undefined
  for (let i = 0; i < count; i++) {
    last = await checkRateLimit(request, options)
  }
  return last
}

afterAll(() => {
  // Stop the singleton store's cleanup interval so Jest can exit cleanly
  getStore().destroy()
})

describe('Rate Limiting Middleware', () => {
  beforeEach(() => {
    // Clear rate limit store before each test
    getStore().clear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('checkRateLimit', () => {
    it('should allow requests within limit', async () => {
      const request = new NextRequest('http://localhost:3000/api/health', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })

      const result = await checkRateLimit(request, { endpoint: '/api/health' })
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBeLessThan(ENDPOINT_LIMITS['/api/health'].maxRequests)
      expect(result.remaining).toBe(ENDPOINT_LIMITS['/api/health'].maxRequests - 1)
    })

    it('should block requests exceeding rate limit', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })

      const config = ENDPOINT_LIMITS['/api/auth']

      // Make requests up to the limit - all allowed
      for (let i = 0; i < config.maxRequests; i++) {
        const result = await checkRateLimit(request, { endpoint: '/api/auth' })
        expect(result.allowed).toBe(true)
      }

      // Next request should be blocked
      const limitResult = await checkRateLimit(request, { endpoint: '/api/auth' })
      expect(limitResult.allowed).toBe(false)
      expect(limitResult.response?.status).toBe(429)
      expect(limitResult.response?.headers.get('X-RateLimit-Remaining')).toBe('0')
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
      await exhaust(authRequest, { endpoint: '/api/auth' }, authConfig.maxRequests)
      const authBlocked = await checkRateLimit(authRequest, { endpoint: '/api/auth' })
      expect(authBlocked.allowed).toBe(false)

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

      // User 1 exhausts their quota
      const config = ENDPOINT_LIMITS['/api/metrics']
      await exhaust(request1, { endpoint: '/api/metrics', userId: 'user1' }, config.maxRequests)
      const user1Blocked = await checkRateLimit(request1, {
        endpoint: '/api/metrics',
        userId: 'user1',
      })
      expect(user1Blocked.allowed).toBe(false)

      // User 2 (same IP) should be able to make requests
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

      expect(result.limit).toBe(ENDPOINT_LIMITS['/api/health'].maxRequests)
      expect(result.remaining).toBeGreaterThanOrEqual(0)
      expect(result.resetTime).toBeGreaterThan(Date.now())
    })
  })

  describe('rate limit exceeded response', () => {
    async function getBlockedResponse(): Promise<NextResponse> {
      const request = new NextRequest('http://localhost:3000/api/meetings', {
        headers: { 'x-forwarded-for': '10.0.0.1' },
      })
      const config = ENDPOINT_LIMITS['/api/meetings']
      const result = await exhaust(request, { endpoint: '/api/meetings' }, config.maxRequests + 1)
      expect(result?.allowed).toBe(false)
      return result!.response!
    }

    it('should return 429 status with proper headers', async () => {
      const response = await getBlockedResponse()

      expect(response.status).toBe(429)
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
      expect(response.headers.get('X-RateLimit-Limit')).toBe(
        String(ENDPOINT_LIMITS['/api/meetings'].maxRequests)
      )
      expect(response.headers.get('X-RateLimit-Reset')).not.toBeNull()
      expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    })

    it('should include error message in response body', async () => {
      const response = await getBlockedResponse()
      const body = await response.json()

      expect(body.error).toContain('Rate limit exceeded')
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

        // Request at the limit is still allowed with nothing remaining
        const atLimit = await exhaust(request, { endpoint }, config.maxRequests)
        expect(atLimit?.allowed).toBe(true)
        expect(atLimit?.remaining).toBe(0)

        // One past the limit is blocked
        const lastResult = await checkRateLimit(request, { endpoint })
        expect(lastResult.allowed).toBe(false)
        expect(lastResult.response?.status).toBe(429)
        expect(lastResult.response?.headers.get('X-RateLimit-Remaining')).toBe('0')
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
      const allowedCount = results.filter((r) => r.allowed).length
      expect(allowedCount).toBe(config.maxRequests)
    })
  })

  describe('Rate limit recovery', () => {
    it('should allow requests after window expires', async () => {
      jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') })

      const request = new NextRequest('http://localhost:3000/api/auth', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })

      const config = ENDPOINT_LIMITS['/api/auth']
      const endpoint = '/api/auth'

      // Exhaust limit
      await exhaust(request, { endpoint }, config.maxRequests)

      // Should be blocked
      let result = await checkRateLimit(request, { endpoint })
      expect(result.allowed).toBe(false)

      // Still blocked just before the window ends
      jest.setSystemTime(Date.now() + config.windowMs - 1000)
      result = await checkRateLimit(request, { endpoint })
      expect(result.allowed).toBe(false)

      // Window expires
      jest.setSystemTime(Date.now() + 2000)

      // Should allow again
      result = await checkRateLimit(request, { endpoint })
      expect(result.allowed).toBe(true)
    })

    it('should allow requests after the key is reset', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })

      const config = ENDPOINT_LIMITS['/api/auth']
      const store = getStore()
      const endpoint = '/api/auth'

      await exhaust(request, { endpoint }, config.maxRequests)
      let result = await checkRateLimit(request, { endpoint })
      expect(result.allowed).toBe(false)

      // Reset the IP key for this endpoint
      store.reset(endpoint, '127.0.0.1')

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
      for (const [, config] of Object.entries(ENDPOINT_LIMITS)) {
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
      const request1 = new NextRequest('http://localhost:3000/api/auth', {
        headers: { 'x-forwarded-for': '1.2.3.4' },
      })
      const request2 = new NextRequest('http://localhost:3000/api/auth', {
        headers: { 'x-forwarded-for': '5.6.7.8' },
      })

      // Exhaust IP 1
      const config = ENDPOINT_LIMITS['/api/auth']
      await exhaust(request1, { endpoint: '/api/auth' }, config.maxRequests)
      const result1 = await checkRateLimit(request1, { endpoint: '/api/auth' })
      const result2 = await checkRateLimit(request2, { endpoint: '/api/auth' })

      // Different IPs get separate buckets
      expect(result1.allowed).toBe(false)
      expect(result2.allowed).toBe(true)
    })

    it('should handle x-real-ip header', async () => {
      const request1 = new NextRequest('http://localhost:3000/api/auth', {
        headers: { 'x-real-ip': '192.168.1.1' },
      })
      const request2 = new NextRequest('http://localhost:3000/api/auth', {
        headers: { 'x-real-ip': '192.168.1.2' },
      })

      const first = await checkRateLimit(request1, { endpoint: '/api/auth' })
      expect(first.allowed).toBe(true)

      // x-real-ip is used as the key: exhausting one address leaves the other untouched
      const config = ENDPOINT_LIMITS['/api/auth']
      await exhaust(request1, { endpoint: '/api/auth' }, config.maxRequests)
      expect((await checkRateLimit(request1, { endpoint: '/api/auth' })).allowed).toBe(false)
      expect((await checkRateLimit(request2, { endpoint: '/api/auth' })).allowed).toBe(true)
    })
  })
})

describe('withRateLimit wrapper', () => {
  beforeEach(() => {
    getStore().clear()
  })

  it('should enforce rate limits in handler', async () => {
    const handler = jest.fn(async () => NextResponse.json({ success: true }))
    const config = { endpoint: 'wrapper-test', windowMs: 60_000, maxRequests: 2 }

    const makeRequest = () =>
      new NextRequest('http://localhost:3000/api/health', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })

    // Within limit: handler runs and rate limit headers are attached
    const first = await withRateLimit(makeRequest(), handler, config)
    expect(first.status).toBe(200)
    expect(first.headers.get('X-RateLimit-Limit')).toBe('2')
    expect(first.headers.get('X-RateLimit-Remaining')).toBe('1')
    expect(first.headers.get('X-RateLimit-Reset')).not.toBeNull()

    const second = await withRateLimit(makeRequest(), handler, config)
    expect(second.status).toBe(200)
    expect(second.headers.get('X-RateLimit-Remaining')).toBe('0')

    // Over limit: 429 and the handler is not invoked again
    const third = await withRateLimit(makeRequest(), handler, config)
    expect(third.status).toBe(429)
    expect(third.headers.get('Retry-After')).not.toBeNull()
    expect(handler).toHaveBeenCalledTimes(2)
  })
})
