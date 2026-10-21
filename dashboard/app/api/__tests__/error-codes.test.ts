/**
 * Error Codes and HTTP Status Mapping Tests
 * Tests error code definitions, HTTP status mapping, and safe error message extraction
 */

import { describe, it, expect } from '@jest/globals'
import {
  ERROR_CODES,
  getHttpStatus,
  getSafeErrorMessage,
  createErrorResponse,
  ErrorCode,
} from '@/lib/error-handling'
import { NextResponse } from 'next/server'

describe('Error Codes and Status Mapping', () => {
  describe('ERROR_CODES constant', () => {
    it('should define all authentication error codes', () => {
      expect(ERROR_CODES.AUTH_MISSING).toBe('AUTH_MISSING')
      expect(ERROR_CODES.AUTH_INVALID).toBe('AUTH_INVALID')
      expect(ERROR_CODES.AUTH_EXPIRED).toBe('AUTH_EXPIRED')
      expect(ERROR_CODES.INSUFFICIENT_PERMISSIONS).toBe('INSUFFICIENT_PERMISSIONS')
    })

    it('should define all validation error codes', () => {
      expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
      expect(ERROR_CODES.INVALID_INPUT).toBe('INVALID_INPUT')
    })

    it('should define rate limiting error code', () => {
      expect(ERROR_CODES.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED')
    })

    it('should define all server error codes', () => {
      expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR')
      expect(ERROR_CODES.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE')
      expect(ERROR_CODES.NOT_FOUND).toBe('NOT_FOUND')
    })

    it('should define business logic error codes', () => {
      expect(ERROR_CODES.RESOURCE_NOT_FOUND).toBe('RESOURCE_NOT_FOUND')
      expect(ERROR_CODES.CONFLICT).toBe('CONFLICT')
    })

    it('should have no undefined error codes', () => {
      Object.values(ERROR_CODES).forEach((code) => {
        expect(code).not.toBeUndefined()
        expect(code).not.toBeNull()
        expect(typeof code).toBe('string')
        expect(code.length).toBeGreaterThan(0)
        expect(code).toMatch(/^[A-Z_]+$/)
      })
    })
  })

  describe('getHttpStatus function', () => {
    it('should map AUTH_MISSING to 401', () => {
      expect(getHttpStatus(ERROR_CODES.AUTH_MISSING)).toBe(401)
    })

    it('should map AUTH_INVALID to 401', () => {
      expect(getHttpStatus(ERROR_CODES.AUTH_INVALID)).toBe(401)
    })

    it('should map AUTH_EXPIRED to 401', () => {
      expect(getHttpStatus(ERROR_CODES.AUTH_EXPIRED)).toBe(401)
    })

    it('should map INSUFFICIENT_PERMISSIONS to 403', () => {
      expect(getHttpStatus(ERROR_CODES.INSUFFICIENT_PERMISSIONS)).toBe(403)
    })

    it('should map VALIDATION_ERROR to 400', () => {
      expect(getHttpStatus(ERROR_CODES.VALIDATION_ERROR)).toBe(400)
    })

    it('should map INVALID_INPUT to 400', () => {
      expect(getHttpStatus(ERROR_CODES.INVALID_INPUT)).toBe(400)
    })

    it('should map RATE_LIMIT_EXCEEDED to 429', () => {
      expect(getHttpStatus(ERROR_CODES.RATE_LIMIT_EXCEEDED)).toBe(429)
    })

    it('should map INTERNAL_ERROR to 500', () => {
      expect(getHttpStatus(ERROR_CODES.INTERNAL_ERROR)).toBe(500)
    })

    it('should map SERVICE_UNAVAILABLE to 503', () => {
      expect(getHttpStatus(ERROR_CODES.SERVICE_UNAVAILABLE)).toBe(503)
    })

    it('should map NOT_FOUND to 404', () => {
      expect(getHttpStatus(ERROR_CODES.NOT_FOUND)).toBe(404)
    })

    it('should map RESOURCE_NOT_FOUND to 404', () => {
      expect(getHttpStatus(ERROR_CODES.RESOURCE_NOT_FOUND)).toBe(404)
    })

    it('should map CONFLICT to 409', () => {
      expect(getHttpStatus(ERROR_CODES.CONFLICT)).toBe(409)
    })

    it('should default to 500 for unknown error codes', () => {
      expect(getHttpStatus('UNKNOWN_ERROR' as ErrorCode)).toBe(500)
    })
  })

  describe('getSafeErrorMessage function', () => {
    it('should return Error message in development mode', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const error = new Error('Database connection failed')
      const message = getSafeErrorMessage(error, 'Default message')

      expect(message).toBe('Database connection failed')
      process.env.NODE_ENV = originalEnv
    })

    it('should return validation error messages in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const error = new Error('Validation failed: email is invalid')
      const message = getSafeErrorMessage(error, 'Default message')

      expect(message).toBe('Validation failed: email is invalid')
      process.env.NODE_ENV = originalEnv
    })

    it('should return invalid error messages in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const error = new Error('Invalid request format')
      const message = getSafeErrorMessage(error, 'Default message')

      expect(message).toBe('Invalid request format')
      process.env.NODE_ENV = originalEnv
    })

    it('should return default message for sensitive errors in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const error = new Error('Database password is incorrect')
      const message = getSafeErrorMessage(error, 'An error occurred')

      expect(message).toBe('An error occurred')
      process.env.NODE_ENV = originalEnv
    })

    it('should return default message for non-Error objects', () => {
      const message = getSafeErrorMessage('string error', 'Default message')
      expect(message).toBe('Default message')
    })

    it('should return default message for null/undefined errors', () => {
      expect(getSafeErrorMessage(null, 'Default message')).toBe('Default message')
      expect(getSafeErrorMessage(undefined, 'Default message')).toBe('Default message')
    })

    it('should return default message for object errors', () => {
      const message = getSafeErrorMessage({ error: 'something' }, 'Default message')
      expect(message).toBe('Default message')
    })
  })

  describe('createErrorResponse function', () => {
    it('should create error response with all required fields', () => {
      const response = createErrorResponse(
        'Test error message',
        ERROR_CODES.INTERNAL_ERROR,
        'request-123',
        500
      )

      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(500)
    })

    it('should include error details in response', async () => {
      const response = createErrorResponse(
        'Not found',
        ERROR_CODES.RESOURCE_NOT_FOUND,
        'request-456',
        404,
        { resourceId: '123' }
      )

      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Not found')
      expect(data.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND)
      expect(data.requestId).toBe('request-456')
      expect(data.details).toEqual({ resourceId: '123' })
    })

    it('should set correct HTTP status code', async () => {
      const response = createErrorResponse(
        'Unauthorized',
        ERROR_CODES.AUTH_MISSING,
        'request-789',
        401
      )

      expect(response.status).toBe(401)
    })

    it('should include timestamp in ISO format', async () => {
      const response = createErrorResponse(
        'Error',
        ERROR_CODES.INTERNAL_ERROR,
        'request-000',
        500
      )

      const data = await response.json()
      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('should handle multiple detail fields', async () => {
      const details = {
        field: 'email',
        value: 'invalid-email',
        expected: 'valid email format',
      }

      const response = createErrorResponse(
        'Validation failed',
        ERROR_CODES.VALIDATION_ERROR,
        'request-111',
        400,
        details
      )

      const data = await response.json()
      expect(data.details).toEqual(details)
    })

    it('should not include details when not provided', async () => {
      const response = createErrorResponse(
        'Error',
        ERROR_CODES.INTERNAL_ERROR,
        'request-222',
        500
      )

      const data = await response.json()
      expect(data.details).toBeUndefined()
    })

    it('should set success to false', async () => {
      const response = createErrorResponse(
        'Error',
        ERROR_CODES.INTERNAL_ERROR,
        'request-333',
        500
      )

      const data = await response.json()
      expect(data.success).toBe(false)
    })
  })

  describe('Error code type safety', () => {
    it('should type error codes correctly', () => {
      const code: ErrorCode = ERROR_CODES.INTERNAL_ERROR
      expect(code).toBe('INTERNAL_ERROR')
    })

    it('should map all error codes to valid HTTP statuses', () => {
      const codes = Object.values(ERROR_CODES)
      codes.forEach((code) => {
        const status = getHttpStatus(code)
        expect([400, 401, 403, 404, 409, 429, 500, 503]).toContain(status)
      })
    })
  })
})
