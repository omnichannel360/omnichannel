/**
 * Rate Limit Middleware Tests
 *
 * Targets lib/rate-limit-middleware.ts (withRateLimit HOF backed by the
 * RateLimiter class in lib/rate-limiter.ts). Custom key generators live in
 * lib/rate-limiting.ts (createRateLimiter) and are tested against that module.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  withRateLimit,
  cleanupRateLimiters,
  createHealthCheckSkip,
} from '@/lib/rate-limit-middleware'
import {
  RateLimiter,
  RateLimitPresets,
  createRateLimitHeaders,
  type RateLimitConfig,
} from '@/lib/rate-limiter'
import { createRateLimiter, resetRateLimitStore } from '@/lib/rate-limiting'

// Mock NextRequest factory
function createMockRequest(
  url: string = 'http://localhost/api/test',
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(new Request(url, { headers }))
}

// Each test gets its own keyPrefix so limiter state can never leak between tests
let configSeq = 0
function makeConfig(requestsPerWindow: number, windowMs = 60000): RateLimitConfig {
  configSeq += 1
  return {
    requestsPerWindow,
    windowMs,
    tier: 'public',
    keyPrefix: `rl:test:${configSeq}`,
  }
}

function okHandler() {
  return jest.fn(async (_req: NextRequest) => NextResponse.json({ success: true }))
}

afterEach(async () => {
  // Limiters are cached module-wide by keyPrefix; drop them (and their intervals)
  await cleanupRateLimiters()
  resetRateLimitStore()
})

describe('withRateLimit (middleware behaviour)', () => {
  test('allows requests within limit', async () => {
    const handler = okHandler()
    const limitedHandler = withRateLimit(handler, { config: makeConfig(5) })

    const req = createMockRequest('http://localhost/api/test', {
      'x-forwarded-for': '192.168.1.1',
    })

    const response = await limitedHandler(req)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  test('blocks requests exceeding limit', async () => {
    const handler = okHandler()
    const limitedHandler = withRateLimit(handler, { config: makeConfig(2) })
    const req = createMockRequest('http://localhost/api/test', {
      'x-forwarded-for': '192.168.1.1',
    })

    // Make 3 requests
    expect((await limitedHandler(req)).status).toBe(200)
    expect((await limitedHandler(req)).status).toBe(200)
    const thirdResponse = await limitedHandler(req)

    expect(thirdResponse.status).toBe(429)
    const data = await thirdResponse.json()
    expect(data.error).toBeDefined()
    expect(Number(thirdResponse.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(thirdResponse.headers.get('RateLimit-Remaining')).toBe('0')
    // Blocked request must not reach the handler
    expect(handler).toHaveBeenCalledTimes(2)
  })

  test('includes rate limit headers in response', async () => {
    const limitedHandler = withRateLimit(okHandler(), { config: makeConfig(10) })
    const req = createMockRequest('http://localhost/api/test', {
      'x-forwarded-for': '192.168.1.1',
    })

    const response = await limitedHandler(req)

    expect(response.headers.get('RateLimit-Limit')).toBe('10')
    expect(response.headers.get('RateLimit-Remaining')).toBe('9')
    expect(response.headers.get('RateLimit-Reset')).not.toBeNull()
  })

  test('skips rate limiting when skip function returns true', async () => {
    const handler = okHandler()
    const limitedHandler = withRateLimit(handler, {
      config: makeConfig(0), // Would block all requests
      skip: () => true, // But we skip the check
    })
    const req = createMockRequest('http://localhost/api/test')

    const response = await limitedHandler(req)

    expect(response.status).not.toBe(429)
    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  test('enforces the limit when skip function returns false', async () => {
    const limitedHandler = withRateLimit(okHandler(), {
      config: makeConfig(0),
      skip: createHealthCheckSkip(),
    })

    const healthRes = await limitedHandler(createMockRequest('http://localhost/api/health'))
    const otherRes = await limitedHandler(createMockRequest('http://localhost/api/other'))

    expect(healthRes.status).toBe(200)
    expect(otherRes.status).toBe(429)
  })
})

describe('custom key generator (lib/rate-limiting createRateLimiter)', () => {
  test('uses custom key generator', async () => {
    const customKeyGenerator = jest.fn(() => 'custom-key')

    const limiter = createRateLimiter({
      maxRequests: 10,
      windowMs: 60000,
      keyGenerator: customKeyGenerator,
    })

    const req = createMockRequest('http://localhost/api/test')

    await limiter(req)

    expect(customKeyGenerator).toHaveBeenCalledWith(req)
  })

  test('requests mapping to the same custom key share one bucket', async () => {
    const limiter = createRateLimiter({
      maxRequests: 1,
      windowMs: 60000,
      keyGenerator: () => 'shared-key',
    })

    const first = await limiter(
      createMockRequest('http://localhost/api/test', { 'x-forwarded-for': '1.1.1.1' })
    )
    const second = await limiter(
      createMockRequest('http://localhost/api/test', { 'x-forwarded-for': '2.2.2.2' })
    )

    expect(first).toBeNull()
    expect(second?.status).toBe(429)
  })
})

describe('withRateLimit', () => {
  test('adds rate limiting to handler', async () => {
    const handler = jest.fn(async (_req: NextRequest) => NextResponse.json({ data: 'test' }))

    const limitedHandler = withRateLimit(handler, { config: makeConfig(5) })

    const req = createMockRequest('http://localhost/api/test', {
      'x-forwarded-for': '192.168.1.1',
    })

    const response = await limitedHandler(req)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: 'test' })
    expect(response.headers.get('RateLimit-Limit')).toBe('5')
  })
})

describe('RateLimiter (endpoint-specific limiter)', () => {
  test('creates endpoint-specific rate limiter', async () => {
    const limiter = new RateLimiter(makeConfig(10))

    try {
      const result = await limiter.check('127.0.0.1')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
      const headers = createRateLimitHeaders(result.remaining, result.resetAt, 10)
      expect(headers['RateLimit-Limit']).toBe('10')
      expect(headers['RateLimit-Remaining']).toBe('9')
    } finally {
      await limiter.cleanup()
    }
  })

  test('presets define a positive window and limit', () => {
    for (const preset of Object.values(RateLimitPresets)) {
      expect(preset.windowMs).toBeGreaterThan(0)
      expect(preset.requestsPerWindow).toBeGreaterThan(0)
    }
  })
})

describe('shared limiter instance', () => {
  test('wrappers with the same config share one limiter', async () => {
    const config = makeConfig(2)
    const handlerA = withRateLimit(okHandler(), { config })
    const handlerB = withRateLimit(okHandler(), { config })
    const req = createMockRequest('http://localhost/api/test', {
      'x-forwarded-for': '192.168.1.1',
    })

    expect((await handlerA(req)).status).toBe(200)
    expect((await handlerB(req)).status).toBe(200)
    // Third call through either wrapper hits the shared counter
    expect((await handlerA(req)).status).toBe(429)
  })
})

describe('Rate Limiting Integration', () => {
  test('different endpoints have separate limits', async () => {
    // Endpoints are separated by their config (keyPrefix), one wrapper per route
    const authHandler = withRateLimit(okHandler(), { config: makeConfig(2) })
    const healthHandler = withRateLimit(okHandler(), { config: makeConfig(2) })

    const authReq = createMockRequest('http://localhost/api/auth', {
      'x-forwarded-for': '192.168.1.1',
    })

    const healthReq = createMockRequest('http://localhost/api/health', {
      'x-forwarded-for': '192.168.1.1',
    })

    // Use auth limit
    await authHandler(authReq)
    await authHandler(authReq)
    const authBlocked = await authHandler(authReq)

    // Health should still be available
    const healthAllowed = await healthHandler(healthReq)

    expect(authBlocked.status).toBe(429)
    expect(healthAllowed.status).toBe(200)
  })

  test('different IPs have separate limits', async () => {
    const limitedHandler = withRateLimit(okHandler(), { config: makeConfig(2) })

    const req1 = createMockRequest('http://localhost/api/test', {
      'x-forwarded-for': '192.168.1.1',
    })

    const req2 = createMockRequest('http://localhost/api/test', {
      'x-forwarded-for': '192.168.1.2',
    })

    // Use limit for IP1
    await limitedHandler(req1)
    await limitedHandler(req1)
    const ip1Blocked = await limitedHandler(req1)

    // IP2 should still be available
    const ip2Allowed = await limitedHandler(req2)

    expect(ip1Blocked.status).toBe(429)
    expect(ip2Allowed.status).toBe(200)
  })

  test('limit resets after the window expires', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') })
    try {
      const limitedHandler = withRateLimit(okHandler(), { config: makeConfig(1, 60000) })
      const req = createMockRequest('http://localhost/api/test', {
        'x-forwarded-for': '192.168.1.1',
      })

      expect((await limitedHandler(req)).status).toBe(200)
      expect((await limitedHandler(req)).status).toBe(429)

      jest.setSystemTime(Date.now() + 60001)

      expect((await limitedHandler(req)).status).toBe(200)
    } finally {
      jest.useRealTimers()
    }
  })
})
