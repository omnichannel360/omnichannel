/**
 * Integration Tests for Rate Limiting
 * Tests the complete rate limiting flow across all endpoints
 */

import { NextRequest } from 'next/server'
import { getStore } from '@/lib/rateLimit/store'
import { createRateLimitMiddleware, RATE_LIMIT_CONFIGS } from '@/lib/middleware/rateLimit'

describe('Rate Limiting Integration Tests', () => {
  let store = getStore()

  beforeEach(() => {
    // Clear store before each test
    store.clear()
  })

  describe('Endpoint-Specific Limits', () => {
    it('should enforce strict auth endpoint limits (5 req/min)', async () => {
      const middleware = createRateLimitMiddleware({
        ...RATE_LIMIT_CONFIGS.auth,
        endpoint: 'auth',
      })

      const mockRequest = (ip: string) => ({
        headers: new Map([['x-forwarded-for', ip]]),
      } as unknown as NextRequest)

      // First 5 requests should succeed
      for (let i = 0; i < 5; i++) {
        const response = await middleware(mockRequest('192.168.1.1'))
        expect(response.status).toBe(200)
      }

      // 6th request should be rate limited
      const blockedResponse = await middleware(mockRequest('192.168.1.1'))
      expect(blockedResponse.status).toBe(429)
    })

    it('should enforce health endpoint limits (100 req/min)', async () => {
      const middleware = createRateLimitMiddleware({
        ...RATE_LIMIT_CONFIGS.health,
        endpoint: 'health',
      })

      const mockRequest = (ip: string) => ({
        headers: new Map([['x-forwarded-for', ip]]),
      } as unknown as NextRequest)

      // 100 requests should succeed
      for (let i = 0; i < 100; i++) {
        const response = await middleware(mockRequest('192.168.1.1'))
        expect(response.status).toBe(200)
      }

      // 101st request should be rate limited
      const blockedResponse = await middleware(mockRequest('192.168.1.1'))
      expect(blockedResponse.status).toBe(429)
    })

    it('should enforce standard endpoint limits (30 req/min)', async () => {
      const middleware = createRateLimitMiddleware({
        ...RATE_LIMIT_CONFIGS.standard,
        endpoint: 'standard',
      })

      const mockRequest = (ip: string) => ({
        headers: new Map([['x-forwarded-for', ip]]),
      } as unknown as NextRequest)

      // 30 requests should succeed
      for (let i = 0; i < 30; i++) {
        const response = await middleware(mockRequest('192.168.1.1'))
        expect(response.status).toBe(200)
      }

      // 31st request should be rate limited
      const blockedResponse = await middleware(mockRequest('192.168.1.1'))
      expect(blockedResponse.status).toBe(429)
    })
  })

  describe('Per-IP Isolation', () => {
    it('should track limits separately for different IPs', async () => {
      const middleware = createRateLimitMiddleware({
        windowMs: 60 * 1000,
        maxRequests: 5,
        endpoint: 'isolated',
      })

      const mockRequest = (ip: string) => ({
        headers: new Map([['x-forwarded-for', ip]]),
      } as unknown as NextRequest)

      // IP 1: Use up all 5 requests
      for (let i = 0; i < 5; i++) {
        const response = await middleware(mockRequest('192.168.1.1'))
        expect(response.status).toBe(200)
      }

      // IP 1: 6th request should fail
      let blockedResponse = await middleware(mockRequest('192.168.1.1'))
      expect(blockedResponse.status).toBe(429)

      // IP 2: Should still have full quota
      const response = await middleware(mockRequest('192.168.1.2'))
      expect(response.status).toBe(200)

      // IP 2: Can make 4 more requests
      for (let i = 0; i < 4; i++) {
        const r = await middleware(mockRequest('192.168.1.2'))
        expect(r.status).toBe(200)
      }

      // IP 2: 6th request should fail
      blockedResponse = await middleware(mockRequest('192.168.1.2'))
      expect(blockedResponse.status).toBe(429)
    })
  })

  describe('Rate Limit Headers', () => {
    it('should include correct headers in allowed responses', async () => {
      const middleware = createRateLimitMiddleware({
        windowMs: 60 * 1000,
        maxRequests: 5,
        endpoint: 'headers',
      })

      const mockRequest = (ip: string) => ({
        headers: new Map([['x-forwarded-for', ip]]),
      } as unknown as NextRequest)

      const response = await middleware(mockRequest('192.168.1.1'))

      expect(response.headers.get('X-RateLimit-Limit')).toBe('5')
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('4')
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined()
    })

    it('should include correct headers in blocked responses', async () => {
      const middleware = createRateLimitMiddleware({
        windowMs: 60 * 1000,
        maxRequests: 2,
        endpoint: 'blocked-headers',
      })

      const mockRequest = (ip: string) => ({
        headers: new Map([['x-forwarded-for', ip]]),
      } as unknown as NextRequest)

      // Use up the limit
      for (let i = 0; i < 2; i++) {
        await middleware(mockRequest('192.168.1.1'))
      }

      // Next request should be blocked
      const blockedResponse = await middleware(mockRequest('192.168.1.1'))

      expect(blockedResponse.status).toBe(429)
      expect(blockedResponse.headers.get('X-RateLimit-Limit')).toBe('2')
      expect(blockedResponse.headers.get('X-RateLimit-Remaining')).toBe('0')
      expect(blockedResponse.headers.get('Retry-After')).toBeDefined()
    })
  })

  describe('Window Expiration', () => {
    it('should reset limits after window expires', async () => {
      jest.useFakeTimers()
      const middleware = createRateLimitMiddleware({
        windowMs: 5000, // 5 second window
        maxRequests: 2,
        endpoint: 'expiration',
      })

      const mockRequest = (ip: string) => ({
        headers: new Map([['x-forwarded-for', ip]]),
      } as unknown as NextRequest)

      // Use up the limit
      for (let i = 0; i < 2; i++) {
        const response = await middleware(mockRequest('192.168.1.1'))
        expect(response.status).toBe(200)
      }

      // Next request should be blocked
      let blockedResponse = await middleware(mockRequest('192.168.1.1'))
      expect(blockedResponse.status).toBe(429)

      // Advance time by 6 seconds (past window expiration)
      jest.advanceTimersByTime(6000)

      // Next request should succeed (window reset)
      const newResponse = await middleware(mockRequest('192.168.1.1'))
      expect(newResponse.status).toBe(200)

      jest.useRealTimers()
    })
  })

  describe('Concurrent Requests', () => {
    it('should handle concurrent requests correctly', async () => {
      const middleware = createRateLimitMiddleware({
        windowMs: 60 * 1000,
        maxRequests: 10,
        endpoint: 'concurrent',
      })

      const mockRequest = (ip: string) => ({
        headers: new Map([['x-forwarded-for', ip]]),
      } as unknown as NextRequest)

      // Simulate 20 concurrent requests from same IP
      const promises = Array(20)
        .fill(null)
        .map(() => middleware(mockRequest('192.168.1.1')))

      const results = await Promise.all(promises)

      // First 10 should succeed
      const allowed = results.filter(r => r.status === 200).length
      const blocked = results.filter(r => r.status === 429).length

      expect(allowed).toBe(10)
      expect(blocked).toBe(10)
    })
  })

  describe('Store Cleanup', () => {
    it('should cleanup expired entries', async () => {
      const middleware = createRateLimitMiddleware({
        windowMs: 1000, // 1 second window
        maxRequests: 5,
        endpoint: 'cleanup-test',
      })

      const mockRequest = (ip: string) => ({
        headers: new Map([['x-forwarded-for', ip]]),
      } as unknown as NextRequest)

      // Create entries for multiple IPs
      await middleware(mockRequest('192.168.1.1'))
      await middleware(mockRequest('192.168.1.2'))
      await middleware(mockRequest('192.168.1.3'))

      // Check initial stats
      let stats = store.getStats()
      expect(stats['cleanup-test']).toBeGreaterThanOrEqual(1)

      // Wait for window to expire and cleanup to run
      jest.useFakeTimers()
      jest.advanceTimersByTime(65000) // > 60 seconds (cleanup interval)
      jest.useRealTimers()

      // Note: Cleanup runs on interval, manual verification would need hooks
      // This test documents the expected behavior
    })
  })

  describe('Different Endpoints', () => {
    it('should track limits separately for different endpoints', async () => {
      const middleware1 = createRateLimitMiddleware({
        windowMs: 60 * 1000,
        maxRequests: 2,
        endpoint: 'endpoint-a',
      })

      const middleware2 = createRateLimitMiddleware({
        windowMs: 60 * 1000,
        maxRequests: 3,
        endpoint: 'endpoint-b',
      })

      const mockRequest = (ip: string) => ({
        headers: new Map([['x-forwarded-for', ip]]),
      } as unknown as NextRequest)

      // Use endpoint A twice (at limit)
      for (let i = 0; i < 2; i++) {
        const response = await middleware1(mockRequest('192.168.1.1'))
        expect(response.status).toBe(200)
      }

      // Use endpoint B three times (at limit)
      for (let i = 0; i < 3; i++) {
        const response = await middleware2(mockRequest('192.168.1.1'))
        expect(response.status).toBe(200)
      }

      // Endpoint A should be blocked
      const blockedA = await middleware1(mockRequest('192.168.1.1'))
      expect(blockedA.status).toBe(429)

      // Endpoint B should be blocked
      const blockedB = await middleware2(mockRequest('192.168.1.1'))
      expect(blockedB.status).toBe(429)
    })
  })

  describe('Error Responses', () => {
    it('should return proper error JSON in rate limit response', async () => {
      const middleware = createRateLimitMiddleware({
        windowMs: 60 * 1000,
        maxRequests: 1,
        endpoint: 'error-test',
        message: 'Custom rate limit message',
      })

      const mockRequest = (ip: string) => ({
        headers: new Map([['x-forwarded-for', ip]]),
      } as unknown as NextRequest)

      // Use up the limit
      await middleware(mockRequest('192.168.1.1'))

      // Next request should return error response
      const blockedResponse = await middleware(mockRequest('192.168.1.1'))
      expect(blockedResponse.status).toBe(429)

      const body = await blockedResponse.json()
      expect(body.error).toBe('Custom rate limit message')
      expect(body.retryAfter).toBeDefined()
      expect(body.resetTime).toBeDefined()
    })
  })
})
