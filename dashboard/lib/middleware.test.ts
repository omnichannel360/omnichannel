import { describe, test, expect } from '@jest/globals'
import { middleware } from '@/middleware'
import { NextRequest } from 'next/server'
import { generateToken } from '@/lib/auth'

describe('Authentication Middleware', () => {
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

    protectedRoutes.forEach(route => {
      test(`should allow ${route} with valid token`, async () => {
        const token = await generateToken('user-1', 'user@example.com', 'user', 3600)

        const request = new NextRequest(new URL(`http://localhost:3000${route}`), {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        const response = await middleware(request)
        expect(response.status).not.toBe(401)
      })

      test(`should reject ${route} without token`, async () => {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))

        const response = await middleware(request)
        expect(response.status).toBe(401)
      })

      test(`should reject ${route} with invalid token`, async () => {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`), {
          headers: {
            'Authorization': 'Bearer invalid.token.here',
          },
        })

        const response = await middleware(request)
        expect(response.status).toBe(401)
      })
    })
  })

  describe('Public Routes', () => {
    test('should allow /api/health without authentication', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/api/health'))

      const response = await middleware(request)
      expect(response.status).not.toBe(401)
    })

    test('should allow /api/auth endpoints without authentication', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/api/auth'))

      const response = await middleware(request)
      expect(response.status).not.toBe(401)
    })
  })

  describe('Token Validation in Middleware', () => {
    test('should attach user info headers for valid token', async () => {
      const token = await generateToken('user-123', 'test@example.com', 'admin', 3600)

      const request = new NextRequest(new URL('http://localhost:3000/api/alerts'), {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const response = await middleware(request)

      // Check if headers are attached
      expect(response.headers.get('x-user-id')).toBe('user-123')
      expect(response.headers.get('x-user-email')).toBe('test@example.com')
      expect(response.headers.get('x-user-role')).toBe('admin')
    })

    test('should handle missing token gracefully', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/api/alerts'))

      const response = await middleware(request)

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toBeDefined()
    })
  })

  describe('Authorization Header Formats', () => {
    test('should require Bearer prefix', async () => {
      const token = await generateToken('user-1', 'user@example.com', 'user', 3600)

      const request = new NextRequest(new URL('http://localhost:3000/api/alerts'), {
        headers: {
          'Authorization': `Token ${token}`, // Wrong prefix
        },
      })

      const response = await middleware(request)
      expect(response.status).toBe(401)
    })

    test('should handle case-insensitive Bearer prefix', async () => {
      const token = await generateToken('user-1', 'user@example.com', 'user', 3600)

      const request = new NextRequest(new URL('http://localhost:3000/api/alerts'), {
        headers: {
          'authorization': `Bearer ${token}`, // lowercase
        },
      })

      const response = await middleware(request)
      // Should handle both uppercase and lowercase
      expect(response.status).not.toBe(401)
    })
  })
})
