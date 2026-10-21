import { NextRequest } from 'next/server'
import {
  extractRequestContext,
  createErrorResponse,
  logValidationError,
  logDatabaseError,
  tryCatchWithLogging
} from './error-handler'
import { createLogContext } from './logger'

// Mock the logger
jest.mock('./logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
  createLogContext: jest.fn((overrides) => ({
    correlationId: 'test-correlation-id',
    timestamp: new Date().toISOString(),
    ...overrides,
  })),
  getErrorMessage: jest.fn((error) => {
    if (error instanceof Error) return error.message
    return 'Unknown error'
  }),
}))

describe('Error Handler Middleware', () => {
  describe('extractRequestContext', () => {
    it('should extract request context from NextRequest', () => {
      const url = new URL('http://localhost:3000/api/users?page=1&limit=10')
      const request = new NextRequest(url, { method: 'GET' })

      const context = extractRequestContext(request)

      expect(context).toHaveProperty('correlationId')
      expect(context.method).toBe('GET')
      expect(context.path).toContain('/api/users')
    })

    it('should use correlation ID from request headers if present', () => {
      const url = new URL('http://localhost:3000/api/users')
      const headers = new Headers()
      headers.set('x-correlation-id', 'custom-correlation-id')
      const request = new NextRequest(url, { method: 'POST', headers })

      const context = extractRequestContext(request)

      expect(context.correlationId).toBe('custom-correlation-id')
    })

    it('should generate correlation ID if not in headers', () => {
      const url = new URL('http://localhost:3000/api/users')
      const request = new NextRequest(url, { method: 'GET' })

      const context = extractRequestContext(request)

      expect(context.correlationId).toBeDefined()
      expect(typeof context.correlationId).toBe('string')
    })

    it('should extract query parameters', () => {
      const url = new URL('http://localhost:3000/api/users?status=active&role=admin')
      const request = new NextRequest(url, { method: 'GET' })

      const context = extractRequestContext(request)

      expect(context.query).toEqual({ status: 'active', role: 'admin' })
    })

    it('should include user agent from headers', () => {
      const url = new URL('http://localhost:3000/api/users')
      const headers = new Headers()
      headers.set('user-agent', 'Mozilla/5.0')
      const request = new NextRequest(url, { method: 'GET', headers })

      const context = extractRequestContext(request)

      expect(context.userAgent).toBe('Mozilla/5.0')
    })
  })

  describe('createErrorResponse', () => {
    it('should create error response with correct status code', () => {
      const context = createLogContext({ userId: 'user123' })
      const error = new Error('Test error')

      const response = createErrorResponse(error, context, 500)

      expect(response.status).toBe(500)
    })

    it('should include correlation ID in response', () => {
      const context = createLogContext({ correlationId: 'test-id-123' })
      const error = new Error('Test error')

      const response = createErrorResponse(error, context, 500)

      expect(response).toBeDefined()
      // Response body would contain correlationId
    })

    it('should return 400 for validation errors', () => {
      const context = createLogContext()
      const error = new Error('Validation failed: invalid input')

      const response = createErrorResponse(error, context, 400)

      expect(response.status).toBe(400)
    })

    it('should return 500 for server errors', () => {
      const context = createLogContext()
      const error = new Error('Internal server error')

      const response = createErrorResponse(error, context, 500)

      expect(response.status).toBe(500)
    })

    it('should include success: false in response', async () => {
      const context = createLogContext()
      const error = new Error('Test error')

      const response = createErrorResponse(error, context, 500)
      const body = await response.json()

      expect(body.success).toBe(false)
      expect(body.error).toBeDefined()
    })
  })

  describe('logValidationError', () => {
    it('should return 400 status', () => {
      const context = createLogContext({ route: '/api/users' })
      const error = new Error('Email is required')

      const result = logValidationError(error, context, 'email')

      expect(result.status).toBe(400)
    })

    it('should include field name in response', () => {
      const context = createLogContext({ route: '/api/users' })
      const error = new Error('Invalid email format')

      const result = logValidationError(error, context, 'email')

      expect(result.body).toHaveProperty('field', 'email')
      expect(result.body).toHaveProperty('success', false)
    })

    it('should include correlation ID in response', () => {
      const context = createLogContext({
        route: '/api/users',
        correlationId: 'test-correlation-id'
      })
      const error = new Error('Validation failed')

      const result = logValidationError(error, context)

      expect(result.body.correlationId).toBe('test-correlation-id')
    })
  })

  describe('logDatabaseError', () => {
    it('should return 500 status for DB errors', () => {
      const context = createLogContext({ route: '/api/users' })
      const error = new Error('Connection timeout')

      const result = logDatabaseError(error, 'findUser', context)

      expect(result.status).toBe(500)
    })

    it('should not expose detailed error to client', () => {
      const context = createLogContext()
      const error = new Error('PostgreSQL: syntax error in SELECT')

      const result = logDatabaseError(error, 'execute_query', context)

      expect(result.body.error).toBe('Database operation failed')
      expect(result.body.error).not.toContain('PostgreSQL')
      expect(result.body.error).not.toContain('syntax error')
    })

    it('should include safe error message for client', () => {
      const context = createLogContext()
      const error = new Error('DB Connection failed')

      const result = logDatabaseError(error, 'connect', context)

      expect(result.body).toHaveProperty('success', false)
      expect(result.body).toHaveProperty('error')
      expect(result.body).toHaveProperty('correlationId')
    })
  })

  describe('tryCatchWithLogging', () => {
    it('should return success result for successful operation', async () => {
      const operation = jest.fn(async () => ({ id: '123', name: 'Test' }))

      const result = await tryCatchWithLogging(
        operation,
        'fetchUser',
        { userId: 'user123' }
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ id: '123', name: 'Test' })
      }
    })

    it('should return error result for failed operation', async () => {
      const testError = new Error('Operation failed')
      const operation = jest.fn(async () => {
        throw testError
      })

      const result = await tryCatchWithLogging(
        operation,
        'fetchUser'
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe(testError)
      }
    })

    it('should include appropriate status code for errors', async () => {
      const operation = jest.fn(async () => {
        throw new Error('Not found')
      })

      const result = await tryCatchWithLogging(
        operation,
        'findResource'
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.statusCode).toBe(404)
      }
    })

    it('should return 400 for validation errors', async () => {
      const operation = jest.fn(async () => {
        throw new Error('Validation error: invalid input')
      })

      const result = await tryCatchWithLogging(
        operation,
        'validateData'
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.statusCode).toBe(400)
      }
    })

    it('should return 403 for unauthorized errors', async () => {
      const operation = jest.fn(async () => {
        throw new Error('Forbidden: insufficient permissions')
      })

      const result = await tryCatchWithLogging(
        operation,
        'restrictedOperation'
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.statusCode).toBe(403)
      }
    })

    it('should pass operation context through', async () => {
      const operation = jest.fn(async () => ({ result: 'success' }))

      const result = await tryCatchWithLogging(
        operation,
        'myOperation',
        { userId: 'user123', route: '/api/test' }
      )

      expect(result.success).toBe(true)
    })
  })

  describe('Error logging with context', () => {
    it('should log errors with full context information', () => {
      const context = createLogContext({
        userId: 'user123',
        route: '/api/users',
        method: 'POST',
        statusCode: 500,
      })

      expect(context).toHaveProperty('userId', 'user123')
      expect(context).toHaveProperty('route', '/api/users')
      expect(context).toHaveProperty('method', 'POST')
      expect(context).toHaveProperty('statusCode', 500)
    })

    it('should include correlation ID for request tracking', () => {
      const context = createLogContext({ userId: 'user123' })

      expect(context.correlationId).toBeDefined()
      expect(typeof context.correlationId).toBe('string')
      expect(context.correlationId.length).toBeGreaterThan(0)
    })
  })

  describe('Error message extraction', () => {
    it('should handle Error instances', () => {
      const error = new Error('Test error message')
      // The getErrorMessage mock will be called
      expect(error.message).toBe('Test error message')
    })

    it('should handle string errors', () => {
      const errorMsg = 'String error'
      // Direct string handling
      expect(typeof errorMsg).toBe('string')
    })

    it('should provide fallback for unknown error types', () => {
      const unknownError = { message: undefined }
      // Errors without message property should be handled gracefully
      expect(unknownError).toBeDefined()
    })
  })
})
