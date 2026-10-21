import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { asyncRoute, asyncGet, asyncPost } from '@/lib/async-route'
import { logger } from '@/lib/logger'

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    logOperation: vi.fn()
  },
  getErrorMessage: (err: unknown) => {
    if (err instanceof Error) return err.message
    return String(err)
  },
  createLogContext: (overrides?: any) => ({ ...overrides })
}))

describe('asyncRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('successful request handling', () => {
    it('wraps successful handler execution', async () => {
      const handler = vi.fn(async () => NextResponse.json({ success: true }))
      const wrapped = asyncRoute(handler, {
        operationName: 'test-operation',
        method: 'POST'
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST'
      })

      const response = await wrapped(request)

      expect(handler).toHaveBeenCalledOnce()
      expect(response.status).toBe(200)
      expect(logger.debug).toHaveBeenCalled()
      expect(logger.logOperation).toHaveBeenCalledWith(
        'test-operation',
        expect.any(Number),
        true,
        expect.objectContaining({ operation: 'test-operation' })
      )
    })

    it('adds correlation ID to response headers', async () => {
      const handler = vi.fn(async () => NextResponse.json({ success: true }))
      const wrapped = asyncRoute(handler, {
        operationName: 'test-op',
        method: 'GET'
      })

      const request = new NextRequest('http://localhost:3000/api/test')
      const response = await wrapped(request)

      expect(response.headers.get('x-correlation-id')).toBeDefined()
      expect(response.headers.get('x-operation')).toBe('test-op')
    })
  })

  describe('error handling', () => {
    it('catches and logs errors from handler', async () => {
      const testError = new Error('Handler error')
      const handler = vi.fn(async () => {
        throw testError
      })

      const wrapped = asyncRoute(handler, {
        operationName: 'failing-operation',
        method: 'POST'
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST'
      })

      const response = await wrapped(request)

      expect(logger.error).toHaveBeenCalledWith(
        'failing-operation failed',
        testError,
        expect.any(Object)
      )
      expect(response.status).toBe(500)

      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error).toBe('Internal server error')
      expect(body.correlationId).toBeDefined()
    })

    it('handles JSON parsing errors', async () => {
      const handler = vi.fn(async () => {
        throw new SyntaxError('Unexpected token')
      })

      const wrapped = asyncRoute(handler, {
        operationName: 'json-parse',
        method: 'POST'
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST'
      })

      const response = await wrapped(request)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid JSON in request body')
    })

    it('handles type errors', async () => {
      const handler = vi.fn(async () => {
        throw new TypeError('Cannot read property')
      })

      const wrapped = asyncRoute(handler, {
        operationName: 'type-error',
        method: 'POST'
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST'
      })

      const response = await wrapped(request)

      expect(response.status).toBe(400)
    })

    it('uses custom error formatter when provided', async () => {
      const handler = vi.fn(async () => {
        throw new Error('Custom error')
      })

      const customFormatter = vi.fn(() => ({
        message: 'Formatted error message',
        statusCode: 418,
        details: { custom: true }
      }))

      const wrapped = asyncRoute(handler, {
        operationName: 'custom-format',
        method: 'POST',
        errorFormatter: customFormatter
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST'
      })

      const response = await wrapped(request)

      expect(response.status).toBe(418)
      const body = await response.json()
      expect(body.error).toBe('Formatted error message')
      expect(body.details.custom).toBe(true)
    })
  })

  describe('context attachment', () => {
    it('includes custom context in logs', async () => {
      const handler = vi.fn(async () => NextResponse.json({ success: true }))
      const wrapped = asyncRoute(handler, {
        operationName: 'with-context',
        method: 'GET',
        context: {
          userId: 'user-123',
          environment: 'test'
        }
      })

      const request = new NextRequest('http://localhost:3000/api/test')
      await wrapped(request)

      expect(logger.debug).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          userId: 'user-123',
          environment: 'test'
        })
      )
    })

    it('extracts correlation ID from request headers', async () => {
      const handler = vi.fn(async () => NextResponse.json({ success: true }))
      const wrapped = asyncRoute(handler, {
        operationName: 'correlation-test',
        method: 'GET'
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-correlation-id': 'test-correlation-123'
        }
      })

      const response = await wrapped(request)
      expect(response.headers.get('x-correlation-id')).toBeDefined()
    })
  })

  describe('factory functions', () => {
    it('creates GET handler with asyncGet', async () => {
      const handler = vi.fn(async () => NextResponse.json({ method: 'GET' }))
      const wrapped = asyncGet(handler, { operationName: 'get-test' })

      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET'
      })

      await wrapped(request)
      expect(handler).toHaveBeenCalledOnce()
    })

    it('creates POST handler with asyncPost', async () => {
      const handler = vi.fn(async () => NextResponse.json({ method: 'POST' }))
      const wrapped = asyncPost(handler, { operationName: 'post-test' })

      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST'
      })

      await wrapped(request)
      expect(handler).toHaveBeenCalledOnce()
    })
  })

  describe('timing and duration tracking', () => {
    it('records operation duration', async () => {
      const handler = vi.fn(async () => {
        // Simulate some delay
        await new Promise(resolve => setTimeout(resolve, 10))
        return NextResponse.json({ success: true })
      })

      const wrapped = asyncRoute(handler, {
        operationName: 'timed-operation',
        method: 'GET'
      })

      const request = new NextRequest('http://localhost:3000/api/test')
      await wrapped(request)

      expect(logger.logOperation).toHaveBeenCalledWith(
        'timed-operation',
        expect.any(Number),
        true,
        expect.any(Object)
      )

      // Verify that duration was recorded
      const call = (logger.logOperation as any).mock.calls[0]
      expect(call[1]).toBeGreaterThanOrEqual(10)
    })
  })

  describe('response structure', () => {
    it('includes required fields in error response', async () => {
      const handler = vi.fn(async () => {
        throw new Error('Test error')
      })

      const wrapped = asyncRoute(handler, {
        operationName: 'error-response-test',
        method: 'POST'
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST'
      })

      const response = await wrapped(request)
      const body = await response.json()

      expect(body).toHaveProperty('success')
      expect(body).toHaveProperty('error')
      expect(body).toHaveProperty('correlationId')
      expect(body.success).toBe(false)
    })

    it('preserves successful response structure', async () => {
      const expectedBody = {
        success: true,
        data: { id: '123', name: 'Test' }
      }

      const handler = vi.fn(async () =>
        NextResponse.json(expectedBody)
      )

      const wrapped = asyncRoute(handler, {
        operationName: 'success-response-test',
        method: 'GET'
      })

      const request = new NextRequest('http://localhost:3000/api/test')
      const response = await wrapped(request)
      const body = await response.json()

      expect(body).toEqual(expectedBody)
    })
  })
})
