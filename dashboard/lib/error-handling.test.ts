/**
 * Tests for error handling utilities
 * Coverage:
 * - Correlation ID generation and extraction
 * - Error response formatting
 * - Error code mapping
 * - Safe error message extraction
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import {
  generateCorrelationId,
  getOrCreateCorrelationId,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  getHttpStatus,
  getSafeErrorMessage,
  getErrorDetails,
  formatErrorLog,
} from './error-handling'

describe('Error Handling Utilities', () => {
  describe('generateCorrelationId', () => {
    it('generates a valid correlation ID', () => {
      const correlationId = generateCorrelationId()
      expect(correlationId).toMatch(/^\d+-[a-f0-9]{8}$/)
    })

    it('generates unique correlation IDs on repeated calls', () => {
      const id1 = generateCorrelationId()
      const id2 = generateCorrelationId()
      expect(id1).not.toBe(id2)
    })

    it('includes timestamp in correlation ID', () => {
      const before = Date.now()
      const correlationId = generateCorrelationId()
      const after = Date.now()

      const timestamp = parseInt(correlationId.split('-')[0], 10)
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('getOrCreateCorrelationId', () => {
    it('returns provided correlation ID if valid', () => {
      const provided = 'custom-correlation-id'
      const result = getOrCreateCorrelationId(provided)
      expect(result).toBe(provided)
    })

    it('generates new ID if provided ID is null', () => {
      const result = getOrCreateCorrelationId(null)
      expect(result).toMatch(/^\d+-[a-f0-9]{8}$/)
    })

    it('generates new ID if provided ID is empty string', () => {
      const result = getOrCreateCorrelationId('')
      expect(result).toMatch(/^\d+-[a-f0-9]{8}$/)
    })

    it('generates new ID if provided ID is undefined', () => {
      const result = getOrCreateCorrelationId(undefined)
      expect(result).toMatch(/^\d+-[a-f0-9]{8}$/)
    })
  })

  describe('createErrorResponse', () => {
    it('creates properly formatted error response', async () => {
      const correlationId = 'test-correlation-id'
      const response = createErrorResponse('Test error', ERROR_CODES.VALIDATION_ERROR, correlationId, 400)

      expect(response.status).toBe(400)
      const body = await response.json()

      expect(body).toEqual({
        success: false,
        error: 'Test error',
        code: ERROR_CODES.VALIDATION_ERROR,
        requestId: correlationId,
        timestamp: expect.any(String),
      })
    })

    it('includes details when provided', async () => {
      const correlationId = 'test-correlation-id'
      const details = { field: 'email', issue: 'invalid format' }

      const response = createErrorResponse(
        'Validation failed',
        ERROR_CODES.VALIDATION_ERROR,
        correlationId,
        400,
        details
      )

      const body = await response.json()
      expect(body.details).toEqual(details)
    })

    it('timestamp is ISO format', async () => {
      const response = createErrorResponse('Error', ERROR_CODES.INTERNAL_ERROR, 'id', 500)
      const body = await response.json()

      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })

  describe('createSuccessResponse', () => {
    it('creates success response with data', () => {
      const correlationId = 'test-correlation-id'
      const data = { id: 1, name: 'Test' }

      const response = createSuccessResponse(data, correlationId)

      expect(response).toEqual({
        success: true,
        data,
        requestId: correlationId,
        timestamp: expect.any(String),
      })
    })

    it('creates success response without data', () => {
      const correlationId = 'test-correlation-id'

      const response = createSuccessResponse(undefined, correlationId)

      expect(response).toEqual({
        success: true,
        requestId: correlationId,
        timestamp: expect.any(String),
      })
    })
  })

  describe('getHttpStatus', () => {
    it('maps error codes to correct HTTP status codes', () => {
      expect(getHttpStatus(ERROR_CODES.AUTH_MISSING)).toBe(401)
      expect(getHttpStatus(ERROR_CODES.AUTH_INVALID)).toBe(401)
      expect(getHttpStatus(ERROR_CODES.INSUFFICIENT_PERMISSIONS)).toBe(403)
      expect(getHttpStatus(ERROR_CODES.VALIDATION_ERROR)).toBe(400)
      expect(getHttpStatus(ERROR_CODES.RATE_LIMIT_EXCEEDED)).toBe(429)
      expect(getHttpStatus(ERROR_CODES.INTERNAL_ERROR)).toBe(500)
      expect(getHttpStatus(ERROR_CODES.SERVICE_UNAVAILABLE)).toBe(503)
      expect(getHttpStatus(ERROR_CODES.NOT_FOUND)).toBe(404)
    })

    it('defaults to 500 for unknown error codes', () => {
      expect(getHttpStatus('UNKNOWN_CODE' as any)).toBe(500)
    })
  })

  describe('getSafeErrorMessage', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production'
    })

    it('returns default message in production for non-safe errors', () => {
      const error = new Error('Database connection failed')
      const result = getSafeErrorMessage(error, 'A server error occurred')

      expect(result).toBe('A server error occurred')
    })

    it('returns error message in production for validation errors', () => {
      const error = new Error('validation error: email is invalid')
      const result = getSafeErrorMessage(error, 'Default message')

      expect(result).toContain('validation error')
    })

    it('returns actual error message in development', () => {
      process.env.NODE_ENV = 'development'
      const error = new Error('Database connection failed')
      const result = getSafeErrorMessage(error, 'Default message')

      expect(result).toBe('Database connection failed')
    })

    it('handles non-Error objects', () => {
      const result = getSafeErrorMessage('string error', 'Default')
      expect(result).toBe('Default')
    })
  })

  describe('getErrorDetails', () => {
    it('extracts details from Error object', () => {
      const error = new Error('Test error')
      const details = getErrorDetails(error)

      expect(details.message).toBe('Test error')
      expect(details.name).toBe('Error')
      expect(details.stack).toContain('Test error')
    })

    it('handles string errors', () => {
      const details = getErrorDetails('string error')
      expect(details.message).toBe('string error')
    })

    it('handles unknown error types', () => {
      const details = getErrorDetails({ custom: 'object' })
      expect(details.message).toBe('Unknown error')
    })
  })

  describe('formatErrorLog', () => {
    it('formats error log with full context', () => {
      const error = new Error('Test error')
      const context = {
        requestId: 'test-id',
        method: 'POST',
        path: '/api/test',
        userId: 'user-123',
        statusCode: 500,
      }

      const log = formatErrorLog('Operation failed', error, context)

      expect(log.message).toBe('Operation failed')
      expect(log.requestId).toBe('test-id')
      expect(log.method).toBe('POST')
      expect(log.path).toBe('/api/test')
      expect(log.userId).toBe('user-123')
      expect(log.statusCode).toBe(500)
      expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(log.error).toHaveProperty('message')
      expect(log.error).toHaveProperty('stack')
    })

    it('preserves additional context fields', () => {
      const context = {
        requestId: 'id',
        custom: 'field',
        nested: { value: 123 },
      }

      const log = formatErrorLog('Error', new Error('test'), context)

      expect(log.custom).toBe('field')
      expect(log.nested).toEqual({ value: 123 })
    })
  })

  describe('Error code constants', () => {
    it('has all required error codes', () => {
      expect(ERROR_CODES.AUTH_MISSING).toBe('AUTH_MISSING')
      expect(ERROR_CODES.AUTH_INVALID).toBe('AUTH_INVALID')
      expect(ERROR_CODES.INSUFFICIENT_PERMISSIONS).toBe('INSUFFICIENT_PERMISSIONS')
      expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
      expect(ERROR_CODES.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED')
      expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR')
    })
  })
})
