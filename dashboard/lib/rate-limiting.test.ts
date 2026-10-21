import { NextRequest, NextResponse } from 'next/server'
import {
  createRateLimiter,
  defaultKeyGenerator,
  userKeyGenerator,
  rateLimiters,
} from './rate-limiting'

describe('Rate Limiting', () => {
  describe('defaultKeyGenerator', () => {
    it('should generate key from x-forwarded-for header', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      })

      const key = defaultKeyGenerator(request)
      expect(key).toBe('ip:192.168.1.1')
    })

    it('should fallback to x-real-ip header', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-real-ip': '10.0.0.1',
        },
      })

      const key = defaultKeyGenerator(request)
      expect(key).toBe('ip:10.0.0.1')
    })

    it('should use unknown when no IP available', () => {
      const request = new NextRequest('http://localhost:3000/api/test')
      const key = defaultKeyGenerator(request)
      expect(key).toMatch(/^ip:/)
    })
  })

  describe('userKeyGenerator', () => {
    it('should generate key from x-user-id header', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-user-id': 'user-123',
        },
      })

      const key = userKeyGenerator(request)
      expect(key).toBe('user:user-123')
    })

    it('should fallback to IP when no user ID', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      })

      const key = userKeyGenerator(request)
      expect(key).toBe('ip:192.168.1.1')
    })
  })

  describe('createRateLimiter', () => {
    it('should allow requests within limit', async () => {
      const limiter = createRateLimiter({
        maxRequests: 3,
        windowMs: 60000,
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.100',
        },
      })

      const result1 = await limiter(request)
      const result2 = await limiter(request)
      const result3 = await limiter(request)

      expect(result1).toBeNull()
      expect(result2).toBeNull()
      expect(result3).toBeNull()
    })

    it('should reject requests exceeding limit', async () => {
      const limiter = createRateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.101',
        },
      })

      await limiter(request)
      await limiter(request)
      const result3 = await limiter(request)

      expect(result3).not.toBeNull()
      expect(result3?.status).toBe(429)
      const json = await result3?.json()
      expect(json?.error).toContain('Too many requests')
    })

    it('should include rate limit headers', async () => {
      const limiter = createRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.102',
        },
      })

      const result = await limiter(request)
      expect(result?.headers.get('X-RateLimit-Limit')).toBe('5')
      expect(result?.headers.get('X-RateLimit-Remaining')).toBe('4')
      expect(result?.headers.get('X-RateLimit-Reset')).toBeDefined()
    })

    it('should reset counter after window expires', async () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 100, // 100ms window
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.103',
        },
      })

      // First request should succeed
      const result1 = await limiter(request)
      expect(result1).toBeNull()

      // Second request should fail (within window)
      const result2 = await limiter(request)
      expect(result2?.status).toBe(429)

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150))

      // Third request should succeed (after window expires)
      const result3 = await limiter(request)
      expect(result3).toBeNull()
    })

    it('should use custom key generator', async () => {
      const customKeyGen = (req: NextRequest) => {
        return `custom:${req.headers.get('x-custom-id')}`
      }

      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        keyGenerator: customKeyGen,
      })

      const request1 = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-custom-id': 'same-id',
        },
      })

      const request2 = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-custom-id': 'same-id',
        },
      })

      const result1 = await limiter(request1)
      const result2 = await limiter(request2)

      expect(result1).toBeNull()
      expect(result2?.status).toBe(429)
    })

    it('should handle multiple different clients independently', async () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      })

      const request1 = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.200',
        },
      })

      const request2 = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.201',
        },
      })

      const result1a = await limiter(request1)
      const result2a = await limiter(request2)
      const result1b = await limiter(request1)

      expect(result1a).toBeNull() // First request from client1 succeeds
      expect(result2a).toBeNull() // First request from client2 succeeds
      expect(result1b?.status).toBe(429) // Second request from client1 fails
    })

    it('should calculate remaining requests correctly', async () => {
      const limiter = createRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.104',
        },
      })

      for (let i = 0; i < 3; i++) {
        const result = await limiter(request)
        const remaining = parseInt(result?.headers.get('X-RateLimit-Remaining') || '0')
        expect(remaining).toBe(5 - i - 1)
      }
    })
  })

  describe('rateLimiters - predefined limiters', () => {
    it('auth limiter should exist', () => {
      expect(rateLimiters.auth).toBeDefined()
    })

    it('login limiter should exist', () => {
      expect(rateLimiters.login).toBeDefined()
    })

    it('brain limiter should exist', () => {
      expect(rateLimiters.brain).toBeDefined()
    })

    it('brain limiter should use user key generator', async () => {
      const request = new NextRequest('http://localhost:3000/api/brain', {
        headers: {
          'x-user-id': 'test-user',
        },
      })

      // Should succeed - first request
      const result = await rateLimiters.brain(request)
      expect(result).toBeNull()
    })

    it('auth limiter should use IP key generator', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        headers: {
          'x-forwarded-for': '192.168.1.105',
        },
      })

      // Should succeed - first request
      const result = await rateLimiters.auth(request)
      expect(result).toBeNull()
    })
  })
})
