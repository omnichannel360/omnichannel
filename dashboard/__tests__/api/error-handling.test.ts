/**
 * Error Handling Test Suite
 * Tests for centralized error handling across all API endpoints
 * Covers: error codes, status codes, logging, correlation IDs, and error messages
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { NextRequest, NextResponse } from 'next/server'
import {
  generateCorrelationId,
  getOrCreateCorrelationId,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  getHttpStatus,
  getSafeErrorMessage,
  getErrorDetails,
  handleRouteError,
  formatErrorLog,
  extractCorrelationFromRequest,
} from '@/lib/error-handling'

describe('Error Handling Utilities', () => {
  describe('Correlation ID Generation', () => {
    it('should generate unique correlation IDs', () => {
      const id1 = generateCorrelationId()
      const id2 = generateCorrelationId()

      expect(id1).toBeDefined()
      expect(id2).toBeDefined()
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^\d+-[a-f0-9]+$/)
    })

    it('should reuse provided correlation ID', () => {
      const providedId = 'test-123'
      const result = getOrCreateCorrelationId(providedId)
      expect(result).toBe(providedId)
    })

    it('should generate new ID when none provided', () => {
      const result = getOrCreateCorrelationId(null)
      expect(result).toBeDefined()
      expect(result).toMatch(/^\d+-[a-f0-9]+$/)
    })

    it('should ignore empty string correlation ID', () => {
      const result = getOrCreateCorrelationId('')
      expect(result).toBeDefined()
      expect(result).not.toBe('')
    })
  })

  describe('Error Response Creation', () => {
    it('should create error response with all fields', () => {
      const response = createErrorResponse(
        'Test error message',
        ERROR_CODES.VALIDATION_ERROR,
        'req-123',
        400,
        { field: 'email' }
      )

      expect(response.status).toBe(400)
      const json = response as any
      expect(json.body).toBeDefined()
    })

    it('should map error codes to correct HTTP status', () => {
      const testCases = [
        { code: ERROR_CODES.AUTH_MISSING, status: 401 },
        { code: ERROR_CODES.AUTH_INVALID, status: 401 },
        { code: ERROR_CODES.INSUFFICIENT_PERMISSIONS, status: 403 },
        { code: ERROR_CODES.VALIDATION_ERROR, status: 400 },
        { code: ERROR_CODES.RATE_LIMIT_EXCEEDED, status: 429 },
        { code: ERROR_CODES.RESOURCE_NOT_FOUND, status: 404 },
        { code: ERROR_CODES.INTERNAL_ERROR, status: 500 },
        { code: ERROR_CODES.SERVICE_UNAVAILABLE, status: 503 },
      ]

      testCases.forEach(({ code, status }) => {
        expect(getHttpStatus(code)).toBe(status)
      })
    })

    it('should create success response with data', () => {
      const data = { id: '123', name: 'test' }
      const response = createSuccessResponse(data, 'req-123')

      expect(response.success).toBe(true)
      expect(response.data).toEqual(data)
      expect(response.requestId).toBe('req-123')
      expect(response.timestamp).toBeDefined()
    })

    it('should create success response without data', () => {
      const response = createSuccessResponse(undefined, 'req-123')

      expect(response.success).toBe(true)
      expect(response.data).toBeUndefined()
      expect(response.requestId).toBe('req-123')
    })
  })

  describe('Safe Error Messages', () => {
    it('should return default message for non-Error objects', () => {
      const message = getSafeErrorMessage('string error', 'default message')
      expect(message).toBe('default message')
    })

    it('should expose validation errors in development', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const error = new Error('validation failed for field X')
      const message = getSafeErrorMessage(error, 'default')
      expect(message).toContain('validation')

      process.env.NODE_ENV = originalEnv
    })

    it('should hide error details in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const error = new Error('database connection failed at 192.168.1.1')
      const message = getSafeErrorMessage(error, 'default')
      expect(message).toBe('default')

      process.env.NODE_ENV = originalEnv
    })

    it('should expose validation errors in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const error = new Error('validation failed: email is invalid')
      const message = getSafeErrorMessage(error, 'default')
      expect(message).toContain('validation')

      process.env.NODE_ENV = originalEnv
    })
  })

  describe('Error Details Extraction', () => {
    it('should extract details from Error object', () => {
      const error = new Error('test error')
      error.name = 'TestError'
      const details = getErrorDetails(error)

      expect(details.message).toBe('test error')
      expect(details.name).toBe('TestError')
      expect(details.stack).toBeDefined()
    })

    it('should extract details from string error', () => {
      const details = getErrorDetails('string error')
      expect(details.message).toBe('string error')
      expect(details.stack).toBeUndefined()
    })

    it('should handle unknown error objects', () => {
      const details = getErrorDetails({ code: 'CUSTOM_ERROR' })
      expect(details.message).toBe('Unknown error')
      expect(details.details).toBeDefined()
    })
  })

  describe('Route Error Handler', () => {
    it('should handle SyntaxError (invalid JSON)', () => {
      const error = new SyntaxError('Unexpected token')
      const { response, statusCode } = handleRouteError(error, 'req-123', {
        method: 'POST',
        path: '/api/test',
      })

      expect(statusCode).toBe(400)
      expect(response.status).toBe(400)
    })

    it('should handle validation errors', () => {
      const error = new Error('validation failed: invalid email format')
      const { response, statusCode } = handleRouteError(error, 'req-123', {
        method: 'POST',
        path: '/api/test',
      })

      expect(statusCode).toBe(400)
    })

    it('should handle file not found errors', () => {
      const error = new Error('ENOENT: no such file or directory')
      const { response, statusCode } = handleRouteError(error, 'req-123', {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(404)
    })

    it('should handle permission errors', () => {
      const error = new Error('EACCES: permission denied')
      const { response, statusCode } = handleRouteError(error, 'req-123', {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(403)
    })

    it('should handle timeout errors', () => {
      const error = new Error('Request timeout: operation took too long')
      const { response, statusCode } = handleRouteError(error, 'req-123', {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(503)
    })

    it('should handle generic errors as 500', () => {
      const error = new Error('Something went wrong')
      const { response, statusCode } = handleRouteError(error, 'req-123', {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(500)
    })

    it('should handle non-Error objects', () => {
      const { response, statusCode } = handleRouteError('string error', 'req-123', {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(500)
      expect(response.status).toBe(500)
    })
  })

  describe('Error Logging', () => {
    it('should format error log with context', () => {
      const error = new Error('test error')
      const log = formatErrorLog('Test message', error, {
        requestId: 'req-123',
        method: 'POST',
        path: '/api/test',
        userId: 'user-456',
        statusCode: 500,
      })

      expect(log.message).toBe('Test message')
      expect(log.requestId).toBe('req-123')
      expect(log.method).toBe('POST')
      expect(log.path).toBe('/api/test')
      expect(log.userId).toBe('user-456')
      expect(log.statusCode).toBe(500)
      expect(log.timestamp).toBeDefined()
      expect(log.error).toBeDefined()
    })

    it('should include error details in log', () => {
      const error = new Error('database error')
      const log = formatErrorLog('DB operation failed', error, {
        requestId: 'req-123',
      })

      expect(log.error.message).toBe('database error')
      expect(log.error.name).toBe('Error')
      expect(log.error.stack).toBeDefined()
    })
  })

  describe('Correlation ID Extraction from Request', () => {
    it('should extract correlation ID from x-correlation-id header', () => {
      const headers = new Headers({
        'x-correlation-id': 'test-123',
      })

      const id = extractCorrelationFromRequest(headers)
      expect(id).toBe('test-123')
    })

    it('should fallback to x-request-id header', () => {
      const headers = new Headers({
        'x-request-id': 'fallback-456',
      })

      const id = extractCorrelationFromRequest(headers)
      expect(id).toBe('fallback-456')
    })

    it('should generate ID when no headers provided', () => {
      const headers = new Headers()
      const id = extractCorrelationFromRequest(headers)

      expect(id).toBeDefined()
      expect(id).toMatch(/^\d+-[a-f0-9]+$/)
    })

    it('should prioritize x-correlation-id over x-request-id', () => {
      const headers = new Headers({
        'x-correlation-id': 'primary',
        'x-request-id': 'secondary',
      })

      const id = extractCorrelationFromRequest(headers)
      expect(id).toBe('primary')
    })
  })

  describe('Error Code Coverage', () => {
    it('should have all required error codes', () => {
      const codes = [
        ERROR_CODES.AUTH_MISSING,
        ERROR_CODES.AUTH_INVALID,
        ERROR_CODES.AUTH_EXPIRED,
        ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        ERROR_CODES.VALIDATION_ERROR,
        ERROR_CODES.INVALID_INPUT,
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        ERROR_CODES.INTERNAL_ERROR,
        ERROR_CODES.SERVICE_UNAVAILABLE,
        ERROR_CODES.NOT_FOUND,
        ERROR_CODES.RESOURCE_NOT_FOUND,
        ERROR_CODES.CONFLICT,
      ]

      codes.forEach((code) => {
        expect(code).toBeDefined()
        expect(typeof code).toBe('string')
        expect(getHttpStatus(code as any)).toBeGreaterThanOrEqual(400)
      })
    })
  })

  describe('HTTP Status Code Mapping', () => {
    it('should return 500 for unknown error codes', () => {
      const status = getHttpStatus('UNKNOWN_CODE' as any)
      expect(status).toBe(500)
    })

    it('should map all error codes to valid HTTP status codes', () => {
      const codes = Object.values(ERROR_CODES)

      codes.forEach((code) => {
        const status = getHttpStatus(code)
        expect(status).toBeGreaterThanOrEqual(400)
        expect([400, 401, 403, 404, 409, 429, 500, 503]).toContain(status)
      })
    })
  })

  describe('Error Response Format', () => {
    it('should include all required fields in error response', async () => {
      const response = createErrorResponse(
        'Test error',
        ERROR_CODES.VALIDATION_ERROR,
        'req-123',
        400,
        { field: 'email' }
      )

      const data = await response.json()

      expect(data).toHaveProperty('success', false)
      expect(data).toHaveProperty('error')
      expect(data).toHaveProperty('code')
      expect(data).toHaveProperty('requestId')
      expect(data).toHaveProperty('timestamp')
      expect(data).toHaveProperty('details')
    })

    it('should not include details when not provided', async () => {
      const response = createErrorResponse(
        'Test error',
        ERROR_CODES.INTERNAL_ERROR,
        'req-123',
        500
      )

      const data = await response.json()

      expect(data).not.toHaveProperty('details')
    })
  })
})

describe('Error Handling Integration Scenarios', () => {
  it('should handle validation error with details', () => {
    const error = new Error('validation failed: field email must be valid email format')
    const { response, statusCode } = handleRouteError(error, 'req-123', {
      method: 'POST',
      path: '/api/users',
      userId: 'user-456',
      operation: 'create_user',
    })

    expect(statusCode).toBe(400)
    expect(response.status).toBe(400)
  })

  it('should preserve request context through error handling', () => {
    const error = new Error('Database connection failed')
    const context = {
      method: 'GET',
      path: '/api/data',
      userId: 'user-789',
      operation: 'load_data',
    }

    const log = formatErrorLog('Data load error', error, {
      requestId: 'req-123',
      ...context,
    })

    expect(log.method).toBe(context.method)
    expect(log.path).toBe(context.path)
    expect(log.userId).toBe(context.userId)
    expect(log.operation).toBe(context.operation)
  })

  it('should generate unique correlation IDs per request', () => {
    const id1 = generateCorrelationId()
    const id2 = generateCorrelationId()

    expect(id1).not.toBe(id2)

    // Extract timestamps - first part before dash
    const timestamp1 = parseInt(id1.split('-')[0])
    const timestamp2 = parseInt(id2.split('-')[0])

    // Timestamps should be equal or timestamp2 slightly higher (millisecond timing)
    expect(timestamp2).toBeGreaterThanOrEqual(timestamp1)
  })
})

