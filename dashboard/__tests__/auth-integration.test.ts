/**
 * Auth Integration Tests - End-to-end flows, multi-route protection, error scenarios
 */

import { generateToken, generateRefreshToken, verifyToken } from '@/lib/auth'
import { getAuthContext, verifyAuthMiddleware } from '@/lib/auth-middleware'
import { NextRequest, NextResponse } from 'next/server'

describe('Authentication Integration Tests', () => {
  describe('End-to-End Auth Flow', () => {
    test('should complete full user login flow', async () => {
      const accessToken = await generateToken('user-123', 'user@example.com', 'user', 3600)
      const refreshToken = await generateRefreshToken('user-123', 'user@example.com')

      expect(accessToken).toBeDefined()
      expect(refreshToken).toBeDefined()

      const request = new NextRequest(new URL('http://localhost/api/dashboard'), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      const payload = await verifyToken(request)
      expect(payload?.sub).toBe('user-123')

      const context = await getAuthContext(request)
      expect(context.authenticated).toBe(true)
    })
  })

  describe('Multi-Route Protection', () => {
    test('should protect multiple API routes consistently', async () => {
      const token = await generateToken('user-123', 'user@example.com', 'user', 3600)
      const routes = ['/api/dashboard', '/api/analytics', '/api/profile']

      for (const route of routes) {
        const request = new NextRequest(new URL(`http://localhost${route}`), {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        const context = await getAuthContext(request)
        expect(context.authenticated).toBe(true)
      }
    })

    test('should reject unauthenticated access to protected routes', async () => {
      const request = new NextRequest(new URL('http://localhost/api/dashboard'), {
        method: 'GET',
      })

      const result = await verifyAuthMiddleware(request, { requireAuth: true })
      expect(result).toBeInstanceOf(NextResponse)
    })

    test('should enforce role-based access', async () => {
      const userToken = await generateToken('user-123', 'user@example.com', 'user', 3600)

      const request = new NextRequest(new URL('http://localhost/api/admin'), {
        headers: {
          'Authorization': `Bearer ${userToken}`,
        },
      })

      const result = await verifyAuthMiddleware(request, {
        requireAuth: true,
        allowedRoles: ['admin'],
      })

      expect(result).toBeInstanceOf(NextResponse)
      expect((result as NextResponse).status).toBe(403)
    })
  })

  describe('Error Handling', () => {
    test('should reject malformed tokens', async () => {
      const request = new NextRequest(new URL('http://localhost/api/test'), {
        headers: {
          'Authorization': 'Bearer invalid.token',
        },
      })

      const payload = await verifyToken(request)
      expect(payload).toBeNull()
    })

    test('should handle concurrent authentication', async () => {
      const token = await generateToken('user-123', 'user@example.com', 'user', 3600)

      const requests = Array.from({ length: 10 }, () =>
        new NextRequest(new URL('http://localhost/api/test'), {
          headers: { 'Authorization': `Bearer ${token}` },
        })
      )

      const results = await Promise.all(requests.map(req => verifyToken(req)))
      results.forEach(result => {
        expect(result?.sub).toBe('user-123')
      })
    })
  })

  describe('Session Management', () => {
    test('should maintain session across multiple requests', async () => {
      const token = await generateToken('user-123', 'user@example.com', 'user', 3600)

      const requests = [
        new NextRequest(new URL('http://localhost/api/dashboard'), {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        new NextRequest(new URL('http://localhost/api/profile'), {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]

      for (const request of requests) {
        const context = await getAuthContext(request)
        expect(context.authenticated).toBe(true)
      }
    })
  })

  describe('Role and Permission Integration', () => {
    test('should enforce permissions across roles', async () => {
      const adminToken = await generateToken('admin-1', 'admin@example.com', 'admin', 3600)
      const userToken = await generateToken('user-1', 'user@example.com', 'user', 3600)

      const adminRequest = new NextRequest(new URL('http://localhost/api/test'), {
        headers: { 'Authorization': `Bearer ${adminToken}` },
      })

      const userRequest = new NextRequest(new URL('http://localhost/api/test'), {
        headers: { 'Authorization': `Bearer ${userToken}` },
      })

      const adminContext = await getAuthContext(adminRequest)
      expect(adminContext.role).toBe('admin')

      const userContext = await getAuthContext(userRequest)
      expect(userContext.role).toBe('user')
    })
  })
})
