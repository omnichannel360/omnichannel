/**
 * Rate Limit Middleware Tests
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  createRateLimitMiddleware,
  withRateLimit,
  createEndpointRateLimiter,
  RateLimitPresets,
  checkRateLimit,
  resetRateLimit,
  initializeRateLimiter,
} from '@/lib/rate-limit-middleware'

// Mock NextRequest factory
function createMockRequest(
  url: string = 'http://localhost/api/test',
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(new Request(url, { headers }))
}

describe('createRateLimitMiddleware', () => {
  test('allows requests within limit', async () => {
    const handler = jest.fn(async () => ({
      success: true,
    }))

    const middleware = createRateLimitMiddleware({
      config: { maxRequests: 5, windowMs: 60000 },
    })

    const limitedHandler = middleware(handler)

    const req = createMockRequest('http://localhost/api/test', {
      'x-forwarded-for': '192.168.1.1',
    })

    const response = await limitedHandler(req)

    if (response instanceof NextResponse) {
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(response.status).toBe(200)
    }
  })

  test('blocks requests exceeding limit', async () => {
    const handler = jest.fn(async () => ({
      success: true,
    }))

    const middleware = createRateLimitMiddleware({
      config: { maxRequests: 2, windowMs: 60000 },
    })

    const limitedHandler = middleware(handler)
    const req = createMockRequest('http://localhost/api/test', {
      'x-forwarded-for': '192.168.1.1',
    })

    // Make 3 requests
    await limitedHandler(req)
    await limitedHandler(req)
    const thirdResponse = await limitedHandler(req)

    if (thirdResponse instanceof NextResponse) {
      expect(thirdResponse.status).toBe(429)
      const data = await thirdResponse.json()
      expect(data.error).toBeDefined()
    }
  })

  test('includes rate limit headers in response', async () => {
    const handler = jest.fn(async () => ({
      success: true,
    }))

    const middleware = createRateLimitMiddleware({
      config: { maxRequests: 10, windowMs: 60000 },
    })

    const limitedHandler = middleware(handler)
    const req = createMockRequest('http://localhost/api/test', {
      'x-forwarded-for': '192.168.1.1',
    })

    const response = await limitedHandler(req)

    if (response instanceof NextResponse) {
      expect(response.headers.get('RateLimit-Limit')).toBe('10')
      expect(response.headers.get('RateLimit-Remaining')).toBeDefined()
      expect(response.headers.get('RateLimit-Reset')).toBeDefined()
    }
  })

  test('skips rate limiting when skip function returns true', async () => {
    const handler = jest.fn(async () => ({
      success: true,
    }))

    const middleware = createRateLimitMiddleware({
      config: { maxRequests: 0, windowMs: 60000 }, // Would block all requests
      skip: () => true, // But we skip the check
    })

    const limitedHandler = middleware(handler)
    const req = createMockRequest('http://localhost/api/test')

    const response = await limitedHandler(req)

    if (response instanceof NextResponse) {
      expect(response.status).not.toBe(429)
    }
  })

  test('uses custom key generator', async () => {
    const handler = jest.fn(async () => ({
      success: true,
    }))

    const customKeyGenerator = jest.fn(() => 'custom-key')

    const middleware = createRateLimitMiddleware({
      config: { maxRequests: 10, windowMs: 60000 },
      keyGenerator: customKeyGenerator,
    })

    const limitedHandler = middleware(handler)
    const req = createMockRequest('http://localhost/api/test')

    await limitedHandler(req)

    expect(customKeyGenerator).toHaveBeenCalledWith(req)
  })
})

describe('withRateLimit', () => {
  test('adds rate limiting to handler', async () => {
    const handler = jest.fn(async () => ({
      data: 'test',
    }))

    const limitedHandler = withRateLimit(handler, {
      config: { maxRequests: 5, windowMs: 60000 },
    })

    const req = createMockRequest('http://localhost/api/test', {
      'x-forwarded-for': '192.168.1.1',
    })

    const response = await limitedHandler(req)

    if (response instanceof NextResponse) {
      expect(response.status).toBe(200)
    }
  })
})

describe('createEndpointRateLimiter', () => {
  test('creates endpoint-specific rate limiter', async () => {
    const limiter = createEndpointRateLimiter({
      maxRequests: 10,
      windowMs: 60000,
    })

    const req = createMockRequest('http://localhost/api/test')
    const result = await limiter(req)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(9)
    expect(result.headers['RateLimit-Limit']).toBe('10')
  })
})

describe('initializeRateLimiter', () => {
  test('initializes global rate limiter', () => {
    const limiter = initializeRateLimiter()

    expect(limiter).toBeDefined()
    expect(limiter).toHaveProperty('generateKey')
    expect(limiter).toHaveProperty('isAllowed')
  })

  test('returns same instance on multiple calls', () => {
    const limiter1 = initializeRateLimiter()
    const limiter2 = initializeRateLimiter()

    expect(limiter1).toBe(limiter2)
  })
})

describe('Rate Limiting Integration', () => {
  test('different endpoints have separate limits', async () => {
    const handler = jest.fn(async () => ({
      success: true,
    }))

    const middleware = createRateLimitMiddleware({
      config: { maxRequests: 2, windowMs: 60000 },
    })

    const limitedHandler = middleware(handler)

    const authReq = createMockRequest('http://localhost/api/auth', {
      'x-forwarded-for': '192.168.1.1',
    })

    const healthReq = createMockRequest('http://localhost/api/health', {
      'x-forwarded-for': '192.168.1.1',
    })

    // Use auth limit
    await limitedHandler(authReq)
    await limitedHandler(authReq)
    const authBlocked = await limitedHandler(authReq)

    // Health should still be available
    const healthAllowed = await limitedHandler(healthReq)

    if (authBlocked instanceof NextResponse) {
      expect(authBlocked.status).toBe(429)
    }

    if (healthAllowed instanceof NextResponse) {
      expect(healthAllowed.status).toBe(200)
    }
  })

  test('different IPs have separate limits', async () => {
    const handler = jest.fn(async () => ({
      success: true,
    }))

    const middleware = createRateLimitMiddleware({
      config: { maxRequests: 2, windowMs: 60000 },
    })

    const limitedHandler = middleware(handler)

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

    if (ip1Blocked instanceof NextResponse) {
      expect(ip1Blocked.status).toBe(429)
    }

    if (ip2Allowed instanceof NextResponse) {
      expect(ip2Allowed.status).toBe(200)
    }
  })
})
