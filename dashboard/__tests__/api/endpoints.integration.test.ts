import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { generateToken } from '@/lib/auth'
import { middleware } from '@/middleware'

/**
 * Previously these hit a live server on localhost:3000 via fetch. They now drive the
 * Edge middleware (middleware.ts) directly, which is where the API auth gate lives.
 */
describe('Protected API Endpoints Integration Tests', () => {
  const apiUrl = 'http://localhost:3000'
  let authToken: string

  const callMiddleware = (path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) =>
    middleware(new NextRequest(new URL(`${apiUrl}${path}`), init))

  beforeEach(async () => {
    // Create a test token
    authToken = await generateToken('test-user-123', 'testuser@example.com', 'admin')
  })

  describe('Authentication Requirements', () => {
    const protectedEndpoints = [
      { path: '/api/alerts', method: 'GET' },
      { path: '/api/brain', method: 'GET' },
      { path: '/api/conductor', method: 'POST' },
      { path: '/api/kanban', method: 'GET' },
      { path: '/api/meetings', method: 'GET' },
      { path: '/api/metrics', method: 'GET' },
      { path: '/api/profiles', method: 'GET' },
    ]

    protectedEndpoints.forEach(({ path, method }) => {
      it(`should reject ${method} ${path} without authentication`, async () => {
        const response = await callMiddleware(path, { method })

        expect(response.status).toBe(401)
        const data = await response.json()
        expect(data.success).toBe(false)
        expect(data.error).toBeDefined()
      })

      it(`should accept ${method} ${path} with valid token`, async () => {
        const response = await callMiddleware(path, {
          method,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        })

        // Should not be 401
        expect(response.status).not.toBe(401)
      })

      it(`should reject ${method} ${path} with invalid token`, async () => {
        const response = await callMiddleware(path, {
          method,
          headers: {
            authorization: 'Bearer invalid-token-xyz',
          },
        })

        expect(response.status).toBe(401)
      })

      it(`should reject ${method} ${path} with malformed auth header`, async () => {
        const response = await callMiddleware(path, {
          method,
          headers: {
            authorization: 'InvalidFormat token123',
          },
        })

        expect(response.status).toBe(401)
      })
    })
  })

  describe('Public Endpoints', () => {
    it('should allow GET /api/health without authentication', async () => {
      const response = await callMiddleware('/api/health')
      expect(response.status).not.toBe(401)
    })

    it('should allow POST /api/auth without authentication', async () => {
      const response = await callMiddleware('/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          username: 'test',
          password: 'test',
        }),
      })

      // Should not be 401 (may fail for other reasons)
      expect(response.status).not.toBe(401)
    })
  })

  describe('Token Validation', () => {
    it('should extract user info from token', async () => {
      expect(authToken).toBeDefined()
      expect(authToken.split('.').length).toBe(3)

      // The middleware attaches user info to the forwarded request headers
      const response = await callMiddleware('/api/alerts', {
        headers: { authorization: `Bearer ${authToken}` },
      })
      expect(response.headers.get('x-middleware-request-x-user-id')).toBe('test-user-123')
      expect(response.headers.get('x-middleware-request-x-user-email')).toBe('testuser@example.com')
      expect(response.headers.get('x-middleware-request-x-user-role')).toBe('admin')
      expect(response.headers.get('x-middleware-request-x-auth-verified')).toBe('true')
    })

    it('should handle token expiration gracefully', async () => {
      // Expired tokens should return 401: correctly signed, but exp is in the past
      const now = Math.floor(Date.now() / 1000)
      const expiredToken = jwt.sign(
        { sub: 'test-user-123', email: 'testuser@example.com', role: 'admin', iat: now - 7200, exp: now - 3600 },
        process.env.JWT_SECRET as string
      )

      const response = await callMiddleware('/api/alerts', {
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      })

      expect(response.status).toBe(401)
    })
  })
})
