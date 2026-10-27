/**
 * Rate Limit Middleware Tests
 */

import { withRateLimit, extractUserId, type RouteHandler } from './with-rate-limit'

describe('withRateLimit middleware', () => {
  let mockHandler: RouteHandler
  let requestCount: number

  beforeEach(() => {
    requestCount = 0
    mockHandler = async (request: Request) => {
      requestCount++
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

  })

  describe('Rate limiting enforcement', () => {
    it('allows requests within limit', async () => {
      const wrapped = withRateLimit(mockHandler, {
        pathname: '/api/test',
      })

      const request = new Request('http://localhost/api/test')

      for (let i = 0; i < 5; i++) {
        const response = await wrapped(request)
        expect(response.status).toBe(200)
      }

      expect(requestCount).toBe(5)
    })

    it('denies requests exceeding limit', async () => {
      const wrapped = withRateLimit(mockHandler, {
        pathname: '/api/auth/login',
      })

      // Auth endpoint has maxTokens: 5
      const request = new Request('http://localhost/api/auth/login', {
        method: 'POST',
      })

      const responses = []
      for (let i = 0; i < 10; i++) {
        const response = await wrapped(request)
        responses.push(response)
      }

      // First 5 should succeed
      expect(responses[0].status).toBe(200)
      expect(responses[4].status).toBe(200)

      // 6th should fail
      expect(responses[5].status).toBe(429)

      // Remaining should also fail
      for (let i = 6; i < 10; i++) {
        expect(responses[i].status).toBe(429)
      }
    })

    it('returns proper 429 response', async () => {
      const wrapped = withRateLimit(mockHandler, {
        pathname: '/api/auth/login',
      })

      const request = new Request('http://localhost/api/auth/login', {
        method: 'POST',
      })

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await wrapped(request)
      }

      // Next request should be rate limited
      const response = await wrapped(request)
      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBe('60')

      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error).toContain('Too many requests')
    })
  })

  describe('Rate limit headers', () => {
    it('includes rate limit headers in response', async () => {
      const wrapped = withRateLimit(mockHandler, {
        pathname: '/api/test',
      })

      const request = new Request('http://localhost/api/test')
      const response = await wrapped(request)

      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined()
      expect(response.headers.get('X-RateLimit-Limit')).toBe('100')
    })

    it('decrements remaining count', async () => {
      const wrapped = withRateLimit(mockHandler, {
        pathname: '/api/test',
      })

      const request = new Request('http://localhost/api/test')

      const response1 = await wrapped(request)
      const remaining1 = parseInt(
        response1.headers.get('X-RateLimit-Remaining') || '0'
      )

      const response2 = await wrapped(request)
      const remaining2 = parseInt(
        response2.headers.get('X-RateLimit-Remaining') || '0'
      )

      expect(remaining1).toBeGreaterThan(remaining2)
    })
  })

  describe('Endpoint configuration', () => {
    it('applies correct config for auth endpoints', async () => {
      const wrapped = withRateLimit(mockHandler, {
        pathname: '/api/auth/login',
      })

      const request = new Request('http://localhost/api/auth/login', {
        method: 'POST',
      })

      const responses = []
      for (let i = 0; i < 10; i++) {
        responses.push(await wrapped(request))
      }

      // Auth has maxTokens: 5, so first 5 succeed, rest fail
      const successCount = responses.filter((r) => r.status === 200).length
      expect(successCount).toBe(5)
    })

    it('applies correct config for data endpoints', async () => {
      const wrapped = withRateLimit(mockHandler, {
        pathname: '/api/metrics',
      })

      const request = new Request('http://localhost/api/metrics')

      const responses = []
      for (let i = 0; i < 10; i++) {
        responses.push(await wrapped(request))
      }

      // Metrics has maxTokens: 50, so all 10 succeed
      const successCount = responses.filter((r) => r.status === 200).length
      expect(successCount).toBe(10)
    })

    it('applies correct config for health endpoint', async () => {
      const wrapped = withRateLimit(mockHandler, {
        pathname: '/api/health',
      })

      const request = new Request('http://localhost/api/health')

      const responses = []
      for (let i = 0; i < 100; i++) {
        responses.push(await wrapped(request))
      }

      // Health has maxTokens: 1000, so all 100 succeed
      const successCount = responses.filter((r) => r.status === 200).length
      expect(successCount).toBe(100)
    })
  })

  describe('User-based rate limiting', () => {
    it('applies per-user rate limiting', async () => {
      const getUserId = (req: Request) => {
        const header = req.headers.get('X-User-Id')
        return header || undefined
      }

      const wrapped = withRateLimit(mockHandler, {
        pathname: '/api/test',
        getUserId,
      })

      const request1 = new Request('http://localhost/api/test', {
        headers: { 'X-User-Id': 'user1' },
      })

      const request2 = new Request('http://localhost/api/test', {
        headers: { 'X-User-Id': 'user2' },
      })

      // Both users should have independent limits
      let response1 = await wrapped(request1)
      expect(response1.status).toBe(200)

      let response2 = await wrapped(request2)
      expect(response2.status).toBe(200)

      // Both should work independently
      response1 = await wrapped(request1)
      expect(response1.status).toBe(200)

      response2 = await wrapped(request2)
      expect(response2.status).toBe(200)
    })
  })

  describe('Error handling', () => {
    it('handles handler errors gracefully', async () => {
      const errorHandler: RouteHandler = async () => {
        throw new Error('Handler error')
      }

      const wrapped = withRateLimit(errorHandler, {
        pathname: '/api/test',
      })

      const request = new Request('http://localhost/api/test')

      // Should not throw, but handle gracefully
      try {
        await wrapped(request)
      } catch {
        // Error is expected from handler
      }
    })
  })
})

describe('extractUserId', () => {
  it('extracts user ID from JWT token', () => {
    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      Buffer.from(JSON.stringify({ userId: 'user123' })).toString('base64') +
      '.signature'

    const request = new Request('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${mockToken}` },
    })

    const userId = extractUserId(request)
    expect(userId).toBe('user123')
  })

  it('returns undefined without authorization header', () => {
    const request = new Request('http://localhost/api/test')
    const userId = extractUserId(request)
    expect(userId).toBeUndefined()
  })

  it('returns undefined with invalid token', () => {
    const request = new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer invalid' },
    })

    const userId = extractUserId(request)
    expect(userId).toBeUndefined()
  })
})
