/**
 * Middleware Authentication Tests
 * Verifies auth middleware protects all endpoints correctly
 */

import { proxy as middleware } from './proxy'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

// Mock JWT_SECRET for testing
const TEST_JWT_SECRET = 'test-secret-key-do-not-use-in-production'

// Helper to create test JWT token
function createTestToken(payload: any, expiresIn: string = '24h'): string {
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn })
}

// Helper to create NextRequest
function createRequest(
  pathname: string,
  token?: string,
  method: string = 'GET'
): NextRequest {
  const url = new URL(`http://localhost:3000${pathname}`)
  const request = new NextRequest(url, { method })

  if (token) {
    request.headers.set('authorization', `Bearer ${token}`)
  }

  return request
}

describe('Auth Middleware', () => {
  beforeAll(() => {
    // Set JWT_SECRET for tests
    process.env.JWT_SECRET = TEST_JWT_SECRET
  })

  describe('Protected Routes', () => {
    const protectedRoutes = [
      '/api/alerts',
      '/api/brain',
      '/api/conductor',
      '/api/kanban',
      '/api/meetings',
      '/api/metrics',
      '/api/profiles',
    ]

    describe.each(protectedRoutes)('%s', (route) => {
      test('should return 401 without authorization header', async () => {
        const request = createRequest(route)
        const response = await middleware(request)

        expect(response.status).toBe(401)
        const data = await response.json()
        expect(data.success).toBe(false)
        expect(data.error).toBeDefined()
      })

      test('should return 401 with invalid token', async () => {
        const request = createRequest(route, 'invalid-token')
        const response = await middleware(request)

        expect(response.status).toBe(401)
        const data = await response.json()
        expect(data.success).toBe(false)
      })

      test('should return 401 with expired token', async () => {
        const expiredToken = createTestToken(
          {
            sub: 'user-1',
            email: 'test@example.com',
            role: 'user',
          },
          '-1s' // Already expired
        )

        const request = createRequest(route, expiredToken)
        const response = await middleware(request)

        expect(response.status).toBe(401)
      })

      test('should pass through with valid token', async () => {
        const validToken = createTestToken({
          sub: 'user-1',
          email: 'test@example.com',
          role: 'user',
        })

        const request = createRequest(route, validToken)
        const response = await middleware(request)

        // Middleware should pass through (NextResponse.next()), not return 401
        expect(response.status).not.toBe(401)
      })

      test('should attach user context to headers with valid token', async () => {
        const validToken = createTestToken({
          sub: 'user-123',
          email: 'user@example.com',
          role: 'admin',
        })

        const request = createRequest(route, validToken)
        const response = await middleware(request)

        // NextResponse.next({ request: { headers } }) forwards request headers to the
        // route handler via x-middleware-request-* (not as plain response headers)
        expect(response.headers.get('x-middleware-request-x-user-id')).toBe('user-123')
        expect(response.headers.get('x-middleware-request-x-user-email')).toBe('user@example.com')
        expect(response.headers.get('x-middleware-request-x-user-role')).toBe('admin')
        expect(response.headers.get('x-middleware-request-x-auth-verified')).toBe('true')
        // Identity must not leak onto the client-facing response
        expect(response.headers.get('x-user-id')).toBeNull()
      })

      test('should overwrite client-supplied identity headers (no spoofing)', async () => {
        const validToken = createTestToken({
          sub: 'user-123',
          email: 'user@example.com',
          role: 'user',
        })

        const request = createRequest(route, validToken)
        request.headers.set('x-user-id', 'attacker')
        request.headers.set('x-user-role', 'admin')
        const response = await middleware(request)

        expect(response.headers.get('x-middleware-request-x-user-id')).toBe('user-123')
        expect(response.headers.get('x-middleware-request-x-user-role')).toBe('user')
      })
    })
  })

  describe('Public Routes', () => {
    const publicRoutes = ['/api/health', '/api/health/check']

    describe.each(publicRoutes)('%s', (route) => {
      test('should pass through without authentication', async () => {
        const request = createRequest(route)
        const response = await middleware(request)

        // Should not block public routes
        expect(response.status).not.toBe(401)
      })
    })
  })

  describe('Auth Routes', () => {
    const authRoutes = ['/api/auth', '/api/auth/login', '/api/auth/verify']

    describe.each(authRoutes)('%s', (route) => {
      test('should pass through without authentication', async () => {
        const request = createRequest(route)
        const response = await middleware(request)

        expect(response.status).not.toBe(401)
      })

      test('should allow POST requests without auth', async () => {
        const request = createRequest(route, undefined, 'POST')
        const response = await middleware(request)

        expect(response.status).not.toBe(401)
      })
    })
  })

  describe('Non-API Routes', () => {
    test('should pass through frontend routes unchanged', async () => {
      const request = createRequest('/')
      const response = await middleware(request)

      expect(response.status).not.toBe(401)
    })

    test('should pass through _next routes', async () => {
      const request = createRequest('/_next/data/123.json')
      const response = await middleware(request)

      expect(response.status).not.toBe(401)
    })
  })

  describe('Token Validation', () => {
    test('should validate token signature', async () => {
      // Create token with different secret
      const differentSecretToken = jwt.sign(
        {
          sub: 'user-1',
          email: 'test@example.com',
          role: 'user',
        },
        'different-secret',
        { expiresIn: '24h' }
      )

      const request = createRequest('/api/alerts', differentSecretToken)
      const response = await middleware(request)

      expect(response.status).toBe(401)
    })

    test('should extract correct payload from valid token', async () => {
      const testPayload = {
        sub: 'user-456',
        email: 'admin@example.com',
        role: 'admin',
      }

      const token = createTestToken(testPayload)
      const request = createRequest('/api/alerts', token)
      const response = await middleware(request)

      expect(response.headers.get('x-middleware-request-x-user-id')).toBe('user-456')
      expect(response.headers.get('x-middleware-request-x-user-email')).toBe('admin@example.com')
      expect(response.headers.get('x-middleware-request-x-user-role')).toBe('admin')
    })
  })

  describe('HTTP Methods', () => {
    test('should protect GET requests', async () => {
      const request = createRequest('/api/alerts', undefined, 'GET')
      const response = await middleware(request)

      expect(response.status).toBe(401)
    })

    test('should protect POST requests', async () => {
      const request = createRequest('/api/alerts', undefined, 'POST')
      const response = await middleware(request)

      expect(response.status).toBe(401)
    })

    test('should protect PUT requests', async () => {
      const request = createRequest('/api/alerts', undefined, 'PUT')
      const response = await middleware(request)

      expect(response.status).toBe(401)
    })

    test('should protect DELETE requests', async () => {
      const request = createRequest('/api/alerts', undefined, 'DELETE')
      const response = await middleware(request)

      expect(response.status).toBe(401)
    })
  })

  describe('Error Handling', () => {
    test('should handle malformed authorization header gracefully', async () => {
      const request = createRequest('/api/alerts')
      request.headers.set('authorization', 'InvalidFormat')
      const response = await middleware(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBeDefined()
    })

    test('should handle missing JWT_SECRET gracefully', async () => {
      const originalSecret = process.env.JWT_SECRET
      delete process.env.JWT_SECRET

      const token = createTestToken({
        sub: 'user-1',
        email: 'test@example.com',
        role: 'user',
      })

      // Missing secret must fail closed (401), never let the request through
      const request = createRequest('/api/alerts', token)

      try {
        const response = await middleware(request)
        expect(response.status).toBe(401)
      } finally {
        process.env.JWT_SECRET = originalSecret
      }
    })
  })

  describe('Request Flow', () => {
    test('should allow request to continue with valid auth', async () => {
      const token = createTestToken({
        sub: 'user-1',
        email: 'test@example.com',
        role: 'user',
      })

      const request = createRequest('/api/alerts', token)
      const response = await middleware(request)

      // Should not be an error response
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })

    test('should reject request immediately without valid auth', async () => {
      const request = createRequest('/api/alerts')
      const response = await middleware(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.success).toBe(false)
    })
  })
})
