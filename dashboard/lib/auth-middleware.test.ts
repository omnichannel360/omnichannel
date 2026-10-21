/**
 * Auth Middleware Tests
 * Comprehensive test coverage for auth protection, role-based access, and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import {
  getAuthContext,
  verifyAuthMiddleware,
  withAuth,
  extractAuthFromHeaders,
  auditAuthEvent,
} from './auth-middleware'
import * as auth from '@/lib/auth'

// Mock dependencies
vi.mock('@/lib/auth')
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  createLogContext: vi.fn((ctx) => ctx),
}))

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAuthContext', () => {
    it('should return authenticated context with valid token', async () => {
      const mockToken = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'user',
        iat: Date.now(),
        exp: Date.now() + 24 * 60 * 60 * 1000,
      }

      vi.mocked(auth.verifyToken).mockResolvedValueOnce(mockToken as any)

      const request = new NextRequest(new URL('http://localhost/api/test'), {
        method: 'GET',
      })

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
      expect(context.userId).toBe('user-123')
      expect(context.email).toBe('user@example.com')
      expect(context.role).toBe('user')
    })

    it('should return unauthenticated context with missing token', async () => {
      vi.mocked(auth.verifyToken).mockResolvedValueOnce(null)

      const request = new NextRequest(new URL('http://localhost/api/test'), {
        method: 'GET',
      })

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
      expect(context.error).toBeDefined()
    })

    it('should handle token verification errors', async () => {
      const error = new Error('Invalid token')
      vi.mocked(auth.verifyToken).mockRejectedValueOnce(error)

      const request = new NextRequest(new URL('http://localhost/api/test'), {
        method: 'GET',
      })

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
      expect(context.error).toContain('Invalid token')
    })
  })

  describe('verifyAuthMiddleware', () => {
    it('should allow unauthenticated requests when auth not required', async () => {
      vi.mocked(auth.verifyToken).mockResolvedValueOnce(null)

      const request = new NextRequest(new URL('http://localhost/api/test'), {
        method: 'GET',
      })

      const result = await verifyAuthMiddleware(request, { requireAuth: false })

      expect(result).not.toBeInstanceOf(NextResponse)
      expect(result.authenticated).toBe(false)
    })

    it('should return 401 when auth required but token missing', async () => {
      vi.mocked(auth.verifyToken).mockResolvedValueOnce(null)

      const request = new NextRequest(new URL('http://localhost/api/test'), {
        method: 'GET',
      })

      const result = await verifyAuthMiddleware(request, { requireAuth: true })

      expect(result).toBeInstanceOf(NextResponse)
      expect((result as NextResponse).status).toBe(401)
    })

    it('should enforce role-based access control', async () => {
      const mockToken = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'user',
        iat: Date.now(),
        exp: Date.now() + 24 * 60 * 60 * 1000,
      }

      vi.mocked(auth.verifyToken).mockResolvedValueOnce(mockToken as any)

      const request = new NextRequest(new URL('http://localhost/api/admin'), {
        method: 'GET',
      })

      const result = await verifyAuthMiddleware(request, {
        requireAuth: true,
        allowedRoles: ['admin'],
      })

      expect(result).toBeInstanceOf(NextResponse)
      expect((result as NextResponse).status).toBe(403)
    })

    it('should allow authenticated user with correct role', async () => {
      const mockToken = {
        sub: 'user-123',
        email: 'admin@example.com',
        role: 'admin',
        iat: Date.now(),
        exp: Date.now() + 24 * 60 * 60 * 1000,
      }

      vi.mocked(auth.verifyToken).mockResolvedValueOnce(mockToken as any)

      const request = new NextRequest(new URL('http://localhost/api/admin'), {
        method: 'GET',
      })

      const result = await verifyAuthMiddleware(request, {
        requireAuth: true,
        allowedRoles: ['admin'],
      })

      expect(result).not.toBeInstanceOf(NextResponse)
      expect((result as any).authenticated).toBe(true)
      expect((result as any).role).toBe('admin')
    })

    it('should skip audit logging when disabled', async () => {
      vi.mocked(auth.verifyToken).mockResolvedValueOnce(null)

      const request = new NextRequest(new URL('http://localhost/api/test'), {
        method: 'GET',
      })

      await verifyAuthMiddleware(request, { requireAuth: false, auditLog: false })

      // Logger should not be called
      const { logger } = await import('@/lib/logger')
      expect(logger.info).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
    })
  })

  describe('withAuth wrapper', () => {
    it('should wrap handler and enforce auth', async () => {
      const mockToken = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'user',
        iat: Date.now(),
        exp: Date.now() + 24 * 60 * 60 * 1000,
      }

      vi.mocked(auth.verifyToken).mockResolvedValueOnce(mockToken as any)

      const mockHandler = vi.fn().mockResolvedValueOnce(new Response('Success'))

      const wrappedHandler = withAuth(mockHandler, { requireAuth: true })

      const request = new NextRequest(new URL('http://localhost/api/test'), {
        method: 'GET',
      })

      const response = await wrappedHandler(request)

      expect(mockHandler).toHaveBeenCalled()
      expect(response.status).toBe(200)
    })

    it('should return 401 if handler auth fails', async () => {
      vi.mocked(auth.verifyToken).mockResolvedValueOnce(null)

      const mockHandler = vi.fn()

      const wrappedHandler = withAuth(mockHandler, { requireAuth: true })

      const request = new NextRequest(new URL('http://localhost/api/test'), {
        method: 'GET',
      })

      const response = await wrappedHandler(request)

      expect(mockHandler).not.toHaveBeenCalled()
      expect(response.status).toBe(401)
    })

    it('should catch handler errors and return 500', async () => {
      const mockToken = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'user',
        iat: Date.now(),
        exp: Date.now() + 24 * 60 * 60 * 1000,
      }

      vi.mocked(auth.verifyToken).mockResolvedValueOnce(mockToken as any)

      const error = new Error('Handler failed')
      const mockHandler = vi.fn().mockRejectedValueOnce(error)

      const wrappedHandler = withAuth(mockHandler)

      const request = new NextRequest(new URL('http://localhost/api/test'), {
        method: 'GET',
      })

      const response = await wrappedHandler(request)

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.success).toBe(false)
    })
  })

  describe('extractAuthFromHeaders', () => {
    it('should extract auth from request headers', () => {
      const request = new NextRequest(new URL('http://localhost/api/test'), {
        headers: {
          'x-user-id': 'user-123',
          'x-user-email': 'user@example.com',
          'x-user-role': 'admin',
        },
      })

      const auth = extractAuthFromHeaders(request)

      expect(auth.authenticated).toBe(true)
      expect(auth.userId).toBe('user-123')
      expect(auth.email).toBe('user@example.com')
      expect(auth.role).toBe('admin')
    })

    it('should return unauthenticated when user-id missing', () => {
      const request = new NextRequest(new URL('http://localhost/api/test'), {
        headers: {
          'x-user-email': 'user@example.com',
        },
      })

      const auth = extractAuthFromHeaders(request)

      expect(auth.authenticated).toBe(false)
      expect(auth.error).toBeDefined()
    })
  })

  describe('auditAuthEvent', () => {
    it('should log auth events', () => {
      auditAuthEvent('login', {
        userId: 'user-123',
        email: 'user@example.com',
      })

      const { logger } = require('@/lib/logger')
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Auth audit: login'),
        expect.objectContaining({
          userId: 'user-123',
          email: 'user@example.com',
        })
      )
    })

    it('should log unauthorized access attempts', () => {
      auditAuthEvent('unauthorized_access', {
        path: '/api/admin',
        error: 'Invalid token',
      })

      const { logger } = require('@/lib/logger')
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Auth audit: unauthorized_access'),
        expect.objectContaining({
          path: '/api/admin',
          error: 'Invalid token',
        })
      )
    })
  })
})
