/**
 * Error Handling Integration Tests
 * Tests request/response validation, error logging integration, and end-to-end error scenarios
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import {
  createErrorResponse,
  createSuccessResponse,
  formatErrorLog,
  handleRouteError,
  getErrorDetails,
  extractCorrelationFromRequest,
  ERROR_CODES,
  getOrCreateCorrelationId,
  generateCorrelationId,
} from '@/lib/error-handling'
import { NextResponse } from 'next/server'

describe('Error Handling Integration Tests', () => {
  describe('Correlation ID generation and propagation', () => {
    it('should generate unique correlation IDs', () => {
      const id1 = generateCorrelationId()
      const id2 = generateCorrelationId()

      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^\d+-[a-f0-9]+$/)
      expect(id2).toMatch(/^\d+-[a-f0-9]+$/)
    })

    it('should extract existing correlation ID from headers', () => {
      const existingId = '1234567890-abc123'
      const id = getOrCreateCorrelationId(existingId)

      expect(id).toBe(existingId)
    })

    it('should generate new ID when header is empty', () => {
      const id = getOrCreateCorrelationId(null)

      expect(id).toBeDefined()
      expect(id).toMatch(/^\d+-[a-f0-9]+$/)
    })

    it('should generate new ID when header is undefined', () => {
      const id = getOrCreateCorrelationId(undefined)

      expect(id).toBeDefined()
      expect(id).toMatch(/^\d+-[a-f0-9]+$/)
    })

    it('should extract correlation ID from request headers object', () => {
      const headers = new Headers()
      headers.set('x-correlation-id', 'test-id-12345')

      const id = extractCorrelationFromRequest(headers)

      expect(id).toBe('test-id-12345')
    })

    it('should fallback to x-request-id header', () => {
      const headers = new Headers()
      headers.set('x-request-id', 'request-id-54321')

      const id = extractCorrelationFromRequest(headers)

      expect(id).toBe('request-id-54321')
    })

    it('should generate new ID when no headers provided', () => {
      const headers = new Headers()
      const id = extractCorrelationFromRequest(headers)

      expect(id).toBeDefined()
      expect(id).toMatch(/^\d+-[a-f0-9]+$/)
    })

    it('should prefer x-correlation-id over x-request-id', () => {
      const headers = new Headers()
      headers.set('x-correlation-id', 'correlation-123')
      headers.set('x-request-id', 'request-456')

      const id = extractCorrelationFromRequest(headers)

      expect(id).toBe('correlation-123')
    })
  })

  describe('Error response formatting with correlation ID', () => {
    it('should include correlation ID in error response', async () => {
      const correlationId = 'corr-test-123'
      const response = createErrorResponse(
        'Test error',
        ERROR_CODES.INTERNAL_ERROR,
        correlationId,
        500
      )

      const data = await response.json()

      expect(data.requestId).toBe(correlationId)
    })

    it('should include timestamp in ISO 8601 format', async () => {
      const response = createErrorResponse('Error', ERROR_CODES.INTERNAL_ERROR, 'req-123', 500)

      const data = await response.json()

      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('should have success flag set to false', async () => {
      const response = createErrorResponse('Error', ERROR_CODES.INTERNAL_ERROR, 'req-123', 500)

      const data = await response.json()

      expect(data.success).toBe(false)
    })

    it('should include error code', async () => {
      const response = createErrorResponse(
        'Not found',
        ERROR_CODES.RESOURCE_NOT_FOUND,
        'req-123',
        404
      )

      const data = await response.json()

      expect(data.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND)
    })

    it('should be valid JSON', async () => {
      const response = createErrorResponse('Error', ERROR_CODES.INTERNAL_ERROR, 'req-123', 500)

      const text = await response.text()
      const data = JSON.parse(text)

      expect(data).toBeDefined()
      expect(data.error).toBeDefined()
    })
  })

  describe('Success response formatting', () => {
    it('should create success response with data', () => {
      const response = createSuccessResponse({ id: '123', name: 'Test' }, 'req-123')

      expect(response.success).toBe(true)
      expect(response.data).toEqual({ id: '123', name: 'Test' })
      expect(response.requestId).toBe('req-123')
    })

    it('should include timestamp in success response', () => {
      const response = createSuccessResponse(null, 'req-456')

      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('should omit data when undefined', () => {
      const response = createSuccessResponse(undefined, 'req-789')

      expect(response.data).toBeUndefined()
      expect(response.success).toBe(true)
    })

    it('should handle complex data structures', () => {
      const data = {
        users: [
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
        ],
        pagination: { total: 2, page: 1 },
      }

      const response = createSuccessResponse(data, 'req-000')

      expect(response.data).toEqual(data)
    })
  })

  describe('formatErrorLog function', () => {
    it('should include error details in log', () => {
      const error = new Error('Test error')
      const context = {
        requestId: 'req-123',
        method: 'POST',
        path: '/api/users',
        userId: 'user-456',
      }

      const log = formatErrorLog('Operation failed', error, context)

      expect(log.message).toBe('Operation failed')
      expect(log.requestId).toBe('req-123')
      expect(log.method).toBe('POST')
      expect(log.path).toBe('/api/users')
      expect(log.userId).toBe('user-456')
    })

    it('should extract error name and message', () => {
      const error = new TypeError('Cannot read property X')
      const context = { requestId: 'req-123' }

      const log = formatErrorLog('Type error occurred', error, context)

      expect(log.error.name).toBe('TypeError')
      expect(log.error.message).toBe('Cannot read property X')
      expect(log.error.stack).toBeDefined()
    })

    it('should include timestamp in error log', () => {
      const context = { requestId: 'req-123' }

      const log = formatErrorLog('Error occurred', new Error('test'), context)

      expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('should handle arbitrary context fields', () => {
      const context = {
        requestId: 'req-123',
        statusCode: 500,
        responseTimeMs: 245,
        operation: 'fetch_data',
        customField: 'custom-value',
      }

      const log = formatErrorLog('Operation failed', new Error('test'), context)

      expect(log.statusCode).toBe(500)
      expect(log.responseTimeMs).toBe(245)
      expect(log.operation).toBe('fetch_data')
      expect(log.customField).toBe('custom-value')
    })
  })

  describe('handleRouteError function', () => {
    it('should handle SyntaxError as INVALID_INPUT', () => {
      const error = new SyntaxError('Unexpected token')
      const context = {
        method: 'POST',
        path: '/api/data',
      }

      const { response, statusCode } = handleRouteError(error, 'req-123', context)

      expect(statusCode).toBe(400)
      expect(response.status).toBe(400)
    })

    it('should handle validation errors', () => {
      const error = new Error('validation failed: email is invalid')
      const context = {
        method: 'POST',
        path: '/api/users',
      }

      const { response, statusCode } = handleRouteError(error, 'req-123', context)

      expect(statusCode).toBe(400)
      expect(response.status).toBe(400)
    })

    it('should handle file not found errors', () => {
      const error = new Error('ENOENT: no such file or directory')
      const context = {
        method: 'GET',
        path: '/api/files',
      }

      const { response, statusCode } = handleRouteError(error, 'req-123', context)

      expect(statusCode).toBe(404)
      expect(response.status).toBe(404)
    })

    it('should handle permission errors', () => {
      const error = new Error('EACCES: permission denied')
      const context = {
        method: 'DELETE',
        path: '/api/admin',
      }

      const { response, statusCode } = handleRouteError(error, 'req-123', context)

      expect(statusCode).toBe(403)
      expect(response.status).toBe(403)
    })

    it('should handle timeout errors', () => {
      const error = new Error('Request timeout (ETIMEDOUT)')
      const context = {
        method: 'GET',
        path: '/api/external',
      }

      const { response, statusCode } = handleRouteError(error, 'req-123', context)

      expect(statusCode).toBe(503)
      expect(response.status).toBe(503)
    })

    it('should default to 500 for unknown errors', () => {
      const error = new Error('Unknown error occurred')
      const context = {
        method: 'POST',
        path: '/api/unknown',
      }

      const { response, statusCode } = handleRouteError(error, 'req-123', context)

      expect(statusCode).toBe(500)
      expect(response.status).toBe(500)
    })

    it('should include context in error response', async () => {
      const error = new Error('test error')
      const context = {
        method: 'POST',
        path: '/api/test',
        userId: 'user-123',
        operation: 'create_item',
      }

      const { response } = handleRouteError(error, 'req-123', context)

      expect(response).toBeInstanceOf(NextResponse)
    })

    it('should handle non-Error objects', () => {
      const context = {
        method: 'GET',
        path: '/api/test',
      }

      const { response, statusCode } = handleRouteError('string error', 'req-123', context)

      expect(statusCode).toBe(500)
    })
  })

  describe('Error flow integration', () => {
    it('should handle complete error flow: occurrence -> logging -> response', async () => {
      const correlationId = 'flow-test-123'
      const error = new Error('Database connection failed')
      const context = {
        requestId: correlationId,
        method: 'POST',
        path: '/api/data',
        userId: 'user-456',
        operation: 'insert_record',
      }

      // Log the error
      const errorLog = formatErrorLog('Database operation failed', error, context)

      expect(errorLog.requestId).toBe(correlationId)
      expect(errorLog.error.message).toBe('Database connection failed')
      expect(errorLog.method).toBe('POST')

      // Create error response
      const response = createErrorResponse(
        'Operation failed',
        ERROR_CODES.SERVICE_UNAVAILABLE,
        correlationId,
        503
      )

      const data = await response.json()

      expect(data.requestId).toBe(correlationId)
      expect(data.error).toBe('Operation failed')
      expect(data.code).toBe(ERROR_CODES.SERVICE_UNAVAILABLE)
    })

    it('should handle error with details', async () => {
      const correlationId = 'detailed-error-123'
      const error = new Error('Validation failed')
      const details = {
        field: 'email',
        value: 'invalid-email',
        expected: 'valid email format',
      }

      const response = createErrorResponse(
        'Invalid input',
        ERROR_CODES.VALIDATION_ERROR,
        correlationId,
        400,
        details
      )

      const data = await response.json()

      expect(data.details).toEqual(details)
      expect(data.code).toBe(ERROR_CODES.VALIDATION_ERROR)
      expect(data.requestId).toBe(correlationId)
    })

    it('should handle error recovery path', () => {
      const originalId = 'original-req-123'
      const error = new Error('Operation failed')
      const context = {
        requestId: originalId,
        method: 'GET',
        path: '/api/data',
      }

      const { response, statusCode } = handleRouteError(error, originalId, context)

      expect(statusCode).toBe(500)
      expect(response.status).toBe(500)

      // Could retry or escalate from here
      const retryId = getOrCreateCorrelationId(originalId)
      expect(retryId).toBe(originalId)
    })
  })

  describe('Error response headers', () => {
    it('should set proper content type headers', async () => {
      const response = createErrorResponse('Error', ERROR_CODES.INTERNAL_ERROR, 'req-123', 500)

      const contentType = response.headers.get('content-type')
      expect(contentType).toContain('application/json')
    })

    it('should preserve correlation ID across response', async () => {
      const correlationId = 'header-test-123'
      const response = createErrorResponse('Error', ERROR_CODES.INTERNAL_ERROR, correlationId, 500)

      const data = await response.json()
      expect(data.requestId).toBe(correlationId)
    })
  })

  describe('Error scenarios end-to-end', () => {
    it('should handle rate limit error scenario', async () => {
      const correlationId = 'rate-limit-123'
      const context = {
        requestId: correlationId,
        method: 'POST',
        path: '/api/login',
        attempts: 15,
      }

      const response = createErrorResponse(
        'Too many login attempts. Please try again later.',
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        correlationId,
        429,
        { attempts: context.attempts, resetTimeSeconds: 3600 }
      )

      expect(response.status).toBe(429)
      const data = await response.json()
      expect(data.code).toBe(ERROR_CODES.RATE_LIMIT_EXCEEDED)
    })

    it('should handle authentication error scenario', async () => {
      const correlationId = 'auth-error-123'
      const error = new Error('Invalid credentials')

      const { response } = handleRouteError(error, correlationId, {
        method: 'POST',
        path: '/api/auth/login',
        userId: 'unknown',
      })

      expect(response.status).toBe(500)
    })

    it('should handle validation error scenario', async () => {
      const correlationId = 'validation-error-123'
      const error = new Error('validation failed')

      const { response, statusCode } = handleRouteError(error, correlationId, {
        method: 'POST',
        path: '/api/users',
      })

      expect(statusCode).toBe(400)
    })
  })
})

