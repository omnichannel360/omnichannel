import { NextRequest, NextResponse } from 'next/server'
import { withAuthProtection, createAuthErrorResponse } from './auth-middleware-wrapper'
import * as authModule from './auth'
import * as rateLimitModule from './api-rate-limit-middleware'

// Mock dependencies
jest.mock('./auth')
jest.mock('./api-rate-limit-middleware')
jest.mock('./logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
  createLogContext: jest.fn(),
}))

describe('Auth Middleware Wrapper', () => {
  let mockRequest: Partial<NextRequest>

  beforeEach(() => {
    jest.clearAllMocks()
    mockRequest = {
      method: 'GET',
      nextUrl: {
        pathname: '/api/test',
      } as any,
      headers: new Headers(),
    }

  })

  describe('withAuthProtection', () => {
    it('should return authenticated: true when auth is not required', async () => {
      const result = await withAuthProtection(mockRequest as NextRequest, {
        requireAuth: false,
      })

      expect(result.authenticated).toBe(true)
      expect(result.context.authenticated).toBe(true)
      expect(result.response).toBeUndefined()
    })

    it('should verify auth when requireAuth is true', async () => {
      const mockPayload = {
        sub: 'user123',
        email: 'user@example.com',
        role: 'user',
      }

      ;(authModule.verifyAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        payload: mockPayload,
      })

      const result = await withAuthProtection(mockRequest as NextRequest, {
        requireAuth: true,
      })

      expect(result.authenticated).toBe(true)
      expect(result.context.userId).toBe('user123')
      expect(result.context.email).toBe('user@example.com')
      expect(result.context.role).toBe('user')
    })

    it('should return 401 when authentication fails', async () => {
      ;(authModule.verifyAuth as jest.Mock).mockResolvedValue({
        authenticated: false,
        error: 'Invalid token',
      })

      const result = await withAuthProtection(mockRequest as NextRequest, {
        requireAuth: true,
      })

      expect(result.authenticated).toBe(false)
      expect(result.response?.status).toBe(401)
    })

    it('should check role requirements when specified', async () => {
      ;(authModule.verifyAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        payload: {
          sub: 'user123',
          email: 'user@example.com',
          role: 'user',
        },
      })

      const result = await withAuthProtection(mockRequest as NextRequest, {
        requireAuth: true,
        requiredRoles: ['admin'],
      })

      expect(result.authenticated).toBe(false)
      expect(result.response?.status).toBe(403)
    })

    it('should allow access when user has required role', async () => {
      ;(authModule.verifyAuth as jest.Mock).mockResolvedValue({
        authenticated: true,
        payload: {
          sub: 'user123',
          email: 'user@example.com',
          role: 'admin',
        },
      })

      const result = await withAuthProtection(mockRequest as NextRequest, {
        requireAuth: true,
        requiredRoles: ['admin', 'moderator'],
      })

      expect(result.authenticated).toBe(true)
      expect(result.context.role).toBe('admin')
    })

    it('should apply rate limiting when configured', async () => {
      const mockRateLimitError = new NextResponse(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { status: 429 }
      )

      ;(rateLimitModule.applyRateLimit as jest.Mock).mockResolvedValue(
        mockRateLimitError
      )

      const result = await withAuthProtection(mockRequest as NextRequest, {
        requireAuth: true,
        rateLimitKey: 'test_endpoint',
      })

      expect(result.authenticated).toBe(false)
      expect(result.response?.status).toBe(429)
      expect(rateLimitModule.applyRateLimit).toHaveBeenCalledWith(
        mockRequest,
        'test_endpoint'
      )
    })

    it('should handle errors gracefully', async () => {
      ;(authModule.verifyAuth as jest.Mock).mockRejectedValue(
        new Error('Unexpected error')
      )

      const result = await withAuthProtection(mockRequest as NextRequest, {
        requireAuth: true,
      })

      expect(result.authenticated).toBe(false)
      expect(result.response?.status).toBe(500)
    })
  })

  describe('createAuthErrorResponse', () => {
    it('should create 401 response by default', async () => {
      const response = createAuthErrorResponse('Unauthorized')

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Unauthorized')
      expect(body.success).toBe(false)
    })

    it('should create response with custom status code', async () => {
      const response = createAuthErrorResponse('Forbidden', 403)

      expect(response.status).toBe(403)
    })
  })
})
