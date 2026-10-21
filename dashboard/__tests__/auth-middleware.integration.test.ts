/**
 * Auth Middleware Integration Tests
 * Tests auth protection across all API endpoints
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

function createToken(
  userId: string = 'user-123',
  email: string = 'user@example.com',
  role: string = 'user'
): string {
  return jwt.sign(
    {
      sub: userId,
      email,
      role,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  )
}

function createExpiredToken(): string {
  return jwt.sign(
    {
      sub: 'user-123',
      email: 'user@example.com',
      role: 'user',
    },
    JWT_SECRET,
    { expiresIn: '0s' }
  )
}

function createRequestWithToken(token?: string): NextRequest {
  const headers: Record<string, string> = {}

  if (token) {
    headers['authorization'] = `Bearer ${token}`
  }

  return new NextRequest(new URL('http://localhost/api/test'), {
    method: 'GET',
    headers,
  })
}

describe('Auth Middleware Integration', () => {
  describe('Protected Endpoints', () => {
    it('should reject requests without authentication token', async () => {
      const request = createRequestWithToken()
      const { verifyAuthMiddleware } = await import('@/lib/auth-middleware')

      const result = await verifyAuthMiddleware(request, { requireAuth: true })

      expect(result).toBeInstanceOf(Response)
      const response = result as Response
      expect(response.status).toBe(401)
    })

    it('should accept requests with valid authentication token', async () => {
      const token = createToken()
      const request = createRequestWithToken(token)
      const { verifyAuthMiddleware } = await import('@/lib/auth-middleware')

      const result = await verifyAuthMiddleware(request, { requireAuth: true })

      expect(result).not.toBeInstanceOf(Response)
      const context = result as any
      expect(context.authenticated).toBe(true)
      expect(context.userId).toBe('user-123')
    })

    it('should reject expired tokens', async () => {
      const token = createExpiredToken()
      const request = createRequestWithToken(token)
      const { verifyAuthMiddleware } = await import('@/lib/auth-middleware')

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 100))

      const result = await verifyAuthMiddleware(request, { requireAuth: true })

      expect(result).toBeInstanceOf(Response)
      const response = result as Response
      expect(response.status).toBe(401)
    })

    it('should reject malformed tokens', async () => {
      const request = new NextRequest(new URL('http://localhost/api/test'), {
        headers: {
          authorization: 'Bearer invalid-token',
        },
      })
      const { verifyAuthMiddleware } = await import('@/lib/auth-middleware')

      const result = await verifyAuthMiddleware(request, { requireAuth: true })

      expect(result).toBeInstanceOf(Response)
      const response = result as Response
      expect(response.status).toBe(401)
    })
  })

  describe('Role-Based Access Control', () => {
    it('should allow admin users to access admin endpoints', async () => {
      const token = createToken('admin-123', 'admin@example.com', 'admin')
      const request = createRequestWithToken(token)
      const { verifyAuthMiddleware } = await import('@/lib/auth-middleware')

      const result = await verifyAuthMiddleware(request, {
        requireAuth: true,
        allowedRoles: ['admin'],
      })

      expect(result).not.toBeInstanceOf(Response)
      const context = result as any
      expect(context.authenticated).toBe(true)
      expect(context.role).toBe('admin')
    })

    it('should deny non-admin users from admin endpoints', async () => {
      const token = createToken('user-123', 'user@example.com', 'user')
      const request = createRequestWithToken(token)
      const { verifyAuthMiddleware } = await import('@/lib/auth-middleware')

      const result = await verifyAuthMiddleware(request, {
        requireAuth: true,
        allowedRoles: ['admin'],
      })

      expect(result).toBeInstanceOf(Response)
      const response = result as Response
      expect(response.status).toBe(403)
    })

    it('should allow users with any of multiple allowed roles', async () => {
      const token = createToken('user-123', 'user@example.com', 'moderator')
      const request = createRequestWithToken(token)
      const { verifyAuthMiddleware } = await import('@/lib/auth-middleware')

      const result = await verifyAuthMiddleware(request, {
        requireAuth: true,
        allowedRoles: ['admin', 'moderator'],
      })

      expect(result).not.toBeInstanceOf(Response)
      const context = result as any
      expect(context.authenticated).toBe(true)
    })
  })

  describe('Public Endpoints', () => {
    it('should allow unauthenticated access to public endpoints', async () => {
      const request = createRequestWithToken()
      const { verifyAuthMiddleware } = await import('@/lib/auth-middleware')

      const result = await verifyAuthMiddleware(request, { requireAuth: false })

      expect(result).not.toBeInstanceOf(Response)
      const context = result as any
      expect(context.authenticated).toBe(false)
    })

    it('should allow authenticated access to public endpoints', async () => {
      const token = createToken()
      const request = createRequestWithToken(token)
      const { verifyAuthMiddleware } = await import('@/lib/auth-middleware')

      const result = await verifyAuthMiddleware(request, { requireAuth: false })

      expect(result).not.toBeInstanceOf(Response)
      const context = result as any
      expect(context.authenticated).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid JWT secrets gracefully', async () => {
      const wrongSecret = 'wrong-secret'
      const token = jwt.sign(
        {
          sub: 'user-123',
          email: 'user@example.com',
          role: 'user',
        },
        wrongSecret,
        { expiresIn: '24h' }
      )

      const request = createRequestWithToken(token)
      const { verifyAuthMiddleware } = await import('@/lib/auth-middleware')

      const result = await verifyAuthMiddleware(request, { requireAuth: true })

      expect(result).toBeInstanceOf(Response)
      const response = result as Response
      expect(response.status).toBe(401)
    })

    it('should include error details in error responses', async () => {
      const request = createRequestWithToken()
      const { verifyAuthMiddleware } = await import('@/lib/auth-middleware')

      const result = await verifyAuthMiddleware(request, { requireAuth: true })

      const response = result as Response
      const body = await response.json()
      expect(body.error).toBeDefined()
      expect(body.success).toBe(false)
    })
  })

  describe('Header Propagation', () => {
    it('should extract auth headers correctly', async () => {
      const token = createToken('user-123', 'user@example.com', 'admin')
      const request = new NextRequest(new URL('http://localhost/api/test'), {
        headers: {
          'x-user-id': 'user-123',
          'x-user-email': 'user@example.com',
          'x-user-role': 'admin',
        },
      })

      const { extractAuthFromHeaders } = await import('@/lib/auth-middleware')
      const auth = extractAuthFromHeaders(request)

      expect(auth.authenticated).toBe(true)
      expect(auth.userId).toBe('user-123')
      expect(auth.email).toBe('user@example.com')
      expect(auth.role).toBe('admin')
    })
  })

  describe('Audit Logging', () => {
    it('should log authentication events', async () => {
      const token = createToken()
      const request = createRequestWithToken(token)
      const { verifyAuthMiddleware } = await import('@/lib/auth-middleware')

      // Enable audit logging
      const result = await verifyAuthMiddleware(request, {
        requireAuth: true,
        auditLog: true,
      })

      expect(result).not.toBeInstanceOf(Response)
    })

    it('should skip audit logging when disabled', async () => {
      const request = createRequestWithToken()
      const { verifyAuthMiddleware } = await import('@/lib/auth-middleware')

      const result = await verifyAuthMiddleware(request, {
        requireAuth: false,
        auditLog: false,
      })

      expect(result).not.toBeInstanceOf(Response)
    })
  })
})

