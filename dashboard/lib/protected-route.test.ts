import { NextRequest, NextResponse } from 'next/server'
import { protectRoute, protectRouteMulti } from './protected-route'
import * as middlewareModule from './auth-middleware-wrapper'

jest.mock('./auth-middleware-wrapper')
jest.mock('./logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}))

describe('Protected Route Utilities', () => {
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

  describe('protectRoute', () => {
    it('should call handler when authentication succeeds', async () => {
      ;(middlewareModule.withAuthProtection as jest.Mock).mockResolvedValue({
        authenticated: true,
        context: {
          authenticated: true,
          userId: 'user123',
          email: 'user@example.com',
          role: 'user',
        },
      })

      const mockHandler = jest.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      )

      const protectedHandler = protectRoute(mockHandler)
      const response = await protectedHandler(mockRequest as NextRequest)

      expect(mockHandler).toHaveBeenCalledWith(mockRequest, {
        userId: 'user123',
        email: 'user@example.com',
        role: 'user',
      })
      expect(response.status).toBe(200)
    })

    it('should return error response when authentication fails', async () => {
      const errorResponse = NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )

      ;(middlewareModule.withAuthProtection as jest.Mock).mockResolvedValue({
        authenticated: false,
        response: errorResponse,
        context: { authenticated: false, error: 'Unauthorized' },
      })

      const mockHandler = jest.fn()
      const protectedHandler = protectRoute(mockHandler)
      const response = await protectedHandler(mockRequest as NextRequest)

      expect(mockHandler).not.toHaveBeenCalled()
      expect(response.status).toBe(401)
    })

    it('should pass config to withAuthProtection', async () => {
      ;(middlewareModule.withAuthProtection as jest.Mock).mockResolvedValue({
        authenticated: true,
        context: { authenticated: true },
      })

      const mockHandler = jest.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      )

      const config = { requireAuth: true, rateLimitKey: 'test' }
      const protectedHandler = protectRoute(mockHandler, config)
      await protectedHandler(mockRequest as NextRequest)

      expect(middlewareModule.withAuthProtection).toHaveBeenCalledWith(
        mockRequest,
        config
      )
    })

    it('should handle handler errors gracefully', async () => {
      ;(middlewareModule.withAuthProtection as jest.Mock).mockResolvedValue({
        authenticated: true,
        context: { authenticated: true },
      })

      const mockHandler = jest
        .fn()
        .mockRejectedValue(new Error('Handler error'))

      const protectedHandler = protectRoute(mockHandler)
      const response = await protectedHandler(mockRequest as NextRequest)

      expect(response.status).toBe(500)
    })
  })

  describe('protectRouteMulti', () => {
    it('should protect multiple HTTP methods', async () => {
      ;(middlewareModule.withAuthProtection as jest.Mock).mockResolvedValue({
        authenticated: true,
        context: { authenticated: true, userId: 'user123' },
      })

      const getHandler = jest
        .fn()
        .mockResolvedValue(NextResponse.json({ method: 'GET' }))
      const postHandler = jest
        .fn()
        .mockResolvedValue(NextResponse.json({ method: 'POST' }))

      const protectedHandlers = protectRouteMulti({
        GET: getHandler,
        POST: postHandler,
      })

      const getRequest = { ...mockRequest, method: 'GET' } as NextRequest
      const postRequest = { ...mockRequest, method: 'POST' } as NextRequest

      const getResponse = await protectedHandlers.GET?.(getRequest)
      const postResponse = await protectedHandlers.POST?.(postRequest)

      expect(getHandler).toHaveBeenCalled()
      expect(postHandler).toHaveBeenCalled()
      expect(getResponse?.status).toBe(200)
      expect(postResponse?.status).toBe(200)
    })

    it('should not include unspecified methods', () => {
      const handlers = protectRouteMulti({
        GET: async () => NextResponse.json({}),
      })

      expect(handlers.GET).toBeDefined()
      expect(handlers.POST).toBeUndefined()
      expect(handlers.DELETE).toBeUndefined()
    })

    it('should apply same config to all methods', async () => {
      ;(middlewareModule.withAuthProtection as jest.Mock).mockResolvedValue({
        authenticated: true,
        context: { authenticated: true },
      })

      const config = { requireAuth: true, rateLimitKey: 'endpoint' }
      const handlers = protectRouteMulti(
        {
          GET: async () => NextResponse.json({}),
          POST: async () => NextResponse.json({}),
        },
        config
      )

      const request = mockRequest as NextRequest
      await handlers.GET?.(request)
      await handlers.POST?.(request)

      expect(middlewareModule.withAuthProtection).toHaveBeenNthCalledWith(
        1,
        request,
        config
      )
      expect(middlewareModule.withAuthProtection).toHaveBeenNthCalledWith(
        2,
        request,
        config
      )
    })
  })
})
