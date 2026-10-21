/**
 * Integration tests for Auth Middleware
 *
 * Tests all protected endpoints to ensure they require authentication
 */

import { NextRequest, NextResponse } from 'next/server'
import * as authModule from '@/lib/auth'
import { withAuthProtection } from '@/lib/auth-middleware-wrapper'

// Mock the auth module
jest.mock('@/lib/auth')
jest.mock('@/lib/api-rate-limit-middleware', () => ({
  applyRateLimit: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
  createLogContext: jest.fn(),
}))

describe('Auth Middleware Integration Tests', () => {
  let mockRequest: Partial<NextRequest>

  beforeEach(() => {
    jest.clearAllMocks()
    mockRequest = {
      method: 'GET',
      headers: new Headers({
        'authorization': 'Bearer valid-token',
      }),
      nextUrl: {
        pathname: '/api/test',
      } as any,
    }
  })

  describe('Protected Routes - All Must Require Auth', () => {
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
      it(`${route} should require valid authentication`, async () => {
        const validPayload = {
          sub: 'user123',
          email: 'user@example.com',
          role: 'user',
          iat: Date.now(),
          exp: Date.now() + 86400000,
        }

        ;(authModule.verifyAuth as jest.Mock).mockResolvedValue({
          authenticated: true,
          payload: validPayload,
        })

        const request = {
          ...mockRequest,
          nextUrl: { pathname: route } as any,
        } as NextRequest

        const result = await withAuthProtection(request, {
          requireAuth: true,
          rateLimitKey: route.split('/')[2],
        })

        expect(result.authenticated).toBe(true)
        expect(result.context.userId).toBe('user123')
      })

      it(`${route} should reject requests without token`, async () => {
        ;(authModule.verifyAuth as jest.Mock).mockResolvedValue({
          authenticated: false,
          error: 'Missing authentication token',
        })

        const request = {
          ...mockRequest,
          nextUrl: { pathname: route } as any,
          headers: new Headers(),
        } as NextRequest

        const result = await withAuthProtection(request, {
          requireAuth: true,
        })

        expect(result.authenticated).toBe(false)
        expect(result.response?.status).toBe(401)
      })

      it(`${route} should reject requests with invalid token`, async () => {
        ;(authModule.verifyAuth as jest.Mock).mockResolvedValue({
          authenticated: false,
          error: 'Invalid token signature',
        })

        const request = {
          ...mockRequest,
          nextUrl: { pathname: route } as any,
          headers: new Headers({
            'authorization': 'Bearer invalid-token',
          }),
        } as NextRequest

        const result = await withAuthProtection(request, {
          requireAuth: true,
        })

        expect(result.authenticated).toBe(false)
        expect(result.response?.status).toBe(401)
      })
    })
  })

  describe('Auth Routes - No Auth Required', () => {
    const authRoutes = [
      '/api/auth/login',
      '/api/auth/verify',
      '/api/auth',
    ]

    authRoutes.forEach(route => {
      it(`${route} should not require authentication`, async () => {
        const request = {
          ...mockRequest,
          nextUrl: { pathname: route } as any,
          headers: new Headers(),
        } as NextRequest

        const result = await withAuthProtection(request, {
          requireAuth: false,
          rateLimitKey: 'auth',
        })

        expect(result.authenticated).toBe(true)
      })
    })
  })

  describe('Public Routes - No Auth Required', () => {
    it('/api/health should not require authentication', async () => {
      const request = {
        ...mockRequest,
        nextUrl: { pathname: '/api/health' } as any,
        headers: new Headers(),
      } as NextRequest

      const result = await withAuthProtection(request, {
        requireAuth: false,
      })

      expect(result.authenticated).toBe(true)
    })
  })

  describe('Role-Based Access Control', () => {
    it('should allow users with required role', async () => {
      ;(authModule.verifyAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        payload: {
          sub: 'admin123',
          email: 'admin@example.com',
          role: 'admin',
          iat: Date.now(),
          exp: Date.now() + 86400000,
        },
      })

      const request = mockRequest as NextRequest

      const result = await withAuthProtection(request, {
        requireAuth: true,
        requiredRoles: ['admin'],
      })

      expect(result.authenticated).toBe(true)
    })

    it('should deny users without required role', async () => {
      ;(authModule.verifyAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        payload: {
          sub: 'user123',
          email: 'user@example.com',
          role: 'user',
          iat: Date.now(),
          exp: Date.now() + 86400000,
        },
      })

      const request = mockRequest as NextRequest

      const result = await withAuthProtection(request, {
        requireAuth: true,
        requiredRoles: ['admin'],
      })

      expect(result.authenticated).toBe(false)
      expect(result.response?.status).toBe(403)
    })

    it('should allow users with any of multiple required roles', async () => {
      ;(authModule.verifyAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        payload: {
          sub: 'mod123',
          email: 'mod@example.com',
          role: 'moderator',
          iat: Date.now(),
          exp: Date.now() + 86400000,
        },
      })

      const request = mockRequest as NextRequest

      const result = await withAuthProtection(request, {
        requireAuth: true,
        requiredRoles: ['admin', 'moderator'],
      })

      expect(result.authenticated).toBe(true)
    })
  })

  describe('User Context Injection', () => {
    it('should extract all user data from token', async () => {
      const payload = {
        sub: 'user-123-456',
        email: 'john.doe@example.com',
        role: 'developer',
        iat: 1234567890,
        exp: 1234567890 + 86400,
      }

      ;(authModule.verifyAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        payload,
      })

      const request = mockRequest as NextRequest

      const result = await withAuthProtection(request, {
        requireAuth: true,
      })

      expect(result.context.userId).toBe('user-123-456')
      expect(result.context.email).toBe('john.doe@example.com')
      expect(result.context.role).toBe('developer')
    })
  })

  describe('Error Handling', () => {
    it('should handle auth verification errors gracefully', async () => {
      ;(authModule.verifyAuth as jest.Mock).mockRejectedValue(
        new Error('Database connection error')
      )

      const request = mockRequest as NextRequest

      const result = await withAuthProtection(request, {
        requireAuth: true,
      })

      expect(result.authenticated).toBe(false)
      expect(result.response?.status).toBe(500)
    })

    it('should return meaningful error messages', async () => {
      ;(authModule.verifyAuth as jest.Mock).mockResolvedValue({
        authenticated: false,
        error: 'Token has expired',
      })

      const request = mockRequest as NextRequest

      const result = await withAuthProtection(request, {
        requireAuth: true,
      })

      expect(result.context.error).toBe('Token has expired')
    })
  })

  describe('Rate Limiting Integration', () => {
    it('should respect rate limit configuration', async () => {
      const rateLimitModule = require('@/lib/api-rate-limit-middleware')
      const mockRateLimitResponse = NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )

      rateLimitModule.applyRateLimit.mockResolvedValue(mockRateLimitResponse)

      const request = mockRequest as NextRequest

      const result = await withAuthProtection(request, {
        requireAuth: true,
        rateLimitKey: 'test_endpoint',
      })

      expect(result.response?.status).toBe(429)
    })
  })
})
