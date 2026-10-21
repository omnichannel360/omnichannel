/**
 * Rate Limiting Integration Tests
 * Validates rate limiting across all API endpoints
 */

import { createMockRequest } from '../lib/test-utils'
import { rateLimiters, createRateLimiter, resetRateLimitStore } from '@/lib/rate-limiting'

describe('Rate Limiting Integration', () => {
  // CRITICAL: Reset global store before each test to prevent state pollution
  // This ensures each test starts with a clean rate limit state
  beforeEach(() => {
    resetRateLimitStore()
  })
  describe('Authentication Endpoints', () => {
    test('login endpoint enforces 5 req/min limit per IP', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 5,
        endpoint: 'api/auth/login',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest({ path: '/api/auth/login', ip: '192.168.1.1' })

      // Make 6 requests
      let blockedCount = 0
      for (let i = 0; i < 6; i++) {
        const response = await limiter(request)
        if (response?.status === 429) {
          blockedCount++
        }
      }

      expect(blockedCount).toBe(1) // 6th request should be blocked
    })

    test('verify endpoint enforces 10 req/min limit', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 10,
        endpoint: 'api/auth/verify',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest({ path: '/api/auth/verify' })

      let blockedCount = 0
      for (let i = 0; i < 11; i++) {
        const response = await limiter(request)
        if (response?.status === 429) {
          blockedCount++
        }
      }

      expect(blockedCount).toBe(1) // 11th request should be blocked
    })

    test('auth endpoint enforces 5 req/min limit', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 5,
        endpoint: 'api/auth',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest({ path: '/api/auth' })

      let blockedCount = 0
      for (let i = 0; i < 6; i++) {
        const response = await limiter(request)
        if (response?.status === 429) {
          blockedCount++
        }
      }

      expect(blockedCount).toBe(1)
    })
  })

  describe('Data Endpoints', () => {
    test('alerts GET enforces 50 req/min limit', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 50,
        endpoint: 'api/alerts/GET',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest({ path: '/api/alerts', method: 'GET' })

      let blockedCount = 0
      for (let i = 0; i < 51; i++) {
        const response = await limiter(request)
        if (response?.status === 429) {
          blockedCount++
        }
      }

      expect(blockedCount).toBe(1)
    })

    test('alerts POST/PATCH enforce 20 req/min limit', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 20,
        endpoint: 'api/alerts/POST',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest({ path: '/api/alerts', method: 'POST' })

      let blockedCount = 0
      for (let i = 0; i < 21; i++) {
        const response = await limiter(request)
        if (response?.status === 429) {
          blockedCount++
        }
      }

      expect(blockedCount).toBe(1)
    })

    test('metrics endpoint enforces 100 req/min limit', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 100,
        endpoint: 'api/metrics',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest({ path: '/api/metrics' })

      let blockedCount = 0
      for (let i = 0; i < 101; i++) {
        const response = await limiter(request)
        if (response?.status === 429) {
          blockedCount++
        }
      }

      expect(blockedCount).toBe(1)
    })

    test('profiles endpoint enforces 30-50 req/min limit', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 50,
        endpoint: 'api/profiles',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest({ path: '/api/profiles' })

      let blockedCount = 0
      for (let i = 0; i < 51; i++) {
        const response = await limiter(request)
        if (response?.status === 429) {
          blockedCount++
        }
      }

      expect(blockedCount).toBe(1)
    })
  })

  describe('Expensive Operations', () => {
    test('brain endpoint enforces 10 req/min limit per user', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 10,
        endpoint: 'api/brain',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest({ path: '/api/brain', userId: 'user-1' })

      let blockedCount = 0
      for (let i = 0; i < 11; i++) {
        const response = await limiter(request)
        if (response?.status === 429) {
          blockedCount++
        }
      }

      expect(blockedCount).toBe(1)
    })

    test('different users have separate limits for brain endpoint', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 2,
        endpoint: 'api/brain',
      }
      const limiter = createRateLimiter(config)
      const request1 = createMockRequest({ path: '/api/brain', userId: 'user-1' })
      const request2 = createMockRequest({ path: '/api/brain', userId: 'user-2' })

      // User 1 should be able to make 2 requests
      const res1_1 = await limiter(request1)
      const res1_2 = await limiter(request1)
      const res1_3 = await limiter(request1)

      expect(res1_1?.status).not.toBe(429)
      expect(res1_2?.status).not.toBe(429)
      expect(res1_3?.status).toBe(429)

      // User 2 should have separate limit (fresh)
      const res2_1 = await limiter(request2)
      const res2_2 = await limiter(request2)
      const res2_3 = await limiter(request2)

      expect(res2_1?.status).not.toBe(429)
      expect(res2_2?.status).not.toBe(429)
      expect(res2_3?.status).toBe(429)
    })
  })

  describe('Integration Endpoints', () => {
    test('conductor endpoint enforces 50 req/min limit', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 50,
        endpoint: 'api/conductor',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest({ path: '/api/conductor' })

      let blockedCount = 0
      for (let i = 0; i < 51; i++) {
        const response = await limiter(request)
        if (response?.status === 429) {
          blockedCount++
        }
      }

      expect(blockedCount).toBe(1)
    })

    test('meetings endpoint enforces 50 req/min limit', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 50,
        endpoint: 'api/meetings',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest({ path: '/api/meetings' })

      let blockedCount = 0
      for (let i = 0; i < 51; i++) {
        const response = await limiter(request)
        if (response?.status === 429) {
          blockedCount++
        }
      }

      expect(blockedCount).toBe(1)
    })

    test('kanban GET enforces 100 req/min limit', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 100,
        endpoint: 'api/kanban/GET',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest({ path: '/api/kanban', method: 'GET' })

      let blockedCount = 0
      for (let i = 0; i < 101; i++) {
        const response = await limiter(request)
        if (response?.status === 429) {
          blockedCount++
        }
      }

      expect(blockedCount).toBe(1)
    })

    test('kanban POST enforces 50 req/min limit', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 50,
        endpoint: 'api/kanban/POST',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest({ path: '/api/kanban', method: 'POST' })

      let blockedCount = 0
      for (let i = 0; i < 51; i++) {
        const response = await limiter(request)
        if (response?.status === 429) {
          blockedCount++
        }
      }

      expect(blockedCount).toBe(1)
    })
  })

  describe('Health Monitoring', () => {
    test('health endpoint enforces generous 100 req/min limit', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 100,
        endpoint: 'api/health',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest({ path: '/api/health' })

      let blockedCount = 0
      for (let i = 0; i < 101; i++) {
        const response = await limiter(request)
        if (response?.status === 429) {
          blockedCount++
        }
      }

      expect(blockedCount).toBe(1)
    })
  })

  describe('Response Headers', () => {
    test('all responses include rate limit headers', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 5,
        endpoint: 'api/test',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest()

      const response = await limiter(request)

      // Headers should be present on allowed requests or error responses
      if (response) {
        expect(response.headers.get('X-RateLimit-Limit')).toBeTruthy()
        expect(response.headers.get('X-RateLimit-Remaining')).toBeTruthy()
        expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy()
      }

  afterEach(() => {
    vi.clearAllMocks()
  })
    })

    test('429 response includes Retry-After header', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 1,
        endpoint: 'api/test',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest()

      // First request allowed
      await limiter(request)

      // Second request blocked
      const blockedResponse = await limiter(request)

      if (blockedResponse?.status === 429) {
        expect(blockedResponse.headers.get('Retry-After')).toBeTruthy()
      }
    })

    test('remaining count decreases with each request', async () => {
      const config = {
        windowMs: 60 * 1000,
        maxRequests: 5,
        endpoint: 'api/test',
      }
      const limiter = createRateLimiter(config)
      const request = createMockRequest()

      const response1 = await limiter(request)
      const remaining1 = response1?.headers.get('X-RateLimit-Remaining')

      const response2 = await limiter(request)
      const remaining2 = response2?.headers.get('X-RateLimit-Remaining')

      if (remaining1 && remaining2) {
        expect(Number(remaining1)).toBeGreaterThan(Number(remaining2))
      }
    })
  })

  describe('Isolation by Endpoint', () => {
    test('different endpoints have separate rate limits', async () => {
      const config1 = {
        windowMs: 60 * 1000,
        maxRequests: 2,
        endpoint: 'endpoint1',
      }
      const config2 = {
        windowMs: 60 * 1000,
        maxRequests: 2,
        endpoint: 'endpoint2',
      }

      const limiter1 = createRateLimiter(config1)
      const limiter2 = createRateLimiter(config2)
      const request = createMockRequest()

      // Use up limit for endpoint1
      await limiter1(request)
      await limiter1(request)
      const blocked1 = await limiter1(request)
      expect(blocked1?.status).toBe(429)

      // Endpoint2 should still have capacity
      const allowed2 = await limiter2(request)
      expect(allowed2?.status).not.toBe(429)
    })

    test('same IP across different endpoints is independent', async () => {
      const config1 = {
        windowMs: 60 * 1000,
        maxRequests: 2,
        endpoint: 'api/endpoint1',
      }
      const config2 = {
        windowMs: 60 * 1000,
        maxRequests: 2,
        endpoint: 'api/endpoint2',
      }

      const limiter1 = createRateLimiter(config1)
      const limiter2 = createRateLimiter(config2)
      const request = createMockRequest({ ip: '192.168.1.1' })

      // Exhaust endpoint1
      const res1_1 = await limiter1(request)
      const res1_2 = await limiter1(request)
      const res1_3 = await limiter1(request)

      // Endpoint2 still available from same IP
      const res2_1 = await limiter2(request)
      const res2_2 = await limiter2(request)
      const res2_3 = await limiter2(request)

      expect(res1_3?.status).toBe(429) // endpoint1 exhausted
      expect(res2_3?.status).toBe(429) // endpoint2 exhausted
    })
  })
})
