/**
 * Comprehensive Error Handling Test Suite
 * Tests all error scenarios across API endpoints
 */

import { describe, it, expect, beforeEach, vi } from '@jest/globals'
import { NextRequest, NextResponse } from 'next/server'
import {
  createErrorResponse,
  createSuccessResponse,
  getOrCreateCorrelationId,
  getHttpStatus,
  getSafeErrorMessage,
  getErrorDetails,
  handleRouteError,
  ERROR_CODES,
} from '@/lib/error-handling'

describe('Error Handling Utilities', () => {
  describe('Correlation ID generation', () => {
    it('generates valid correlation ID format', () => {
      const id = getOrCreateCorrelationId()
      expect(id).toMatch(/^\d+-[a-f0-9]+$/)
    })

    it('extracts existing correlation ID', () => {
      const existingId = '1234567890-abcdef'
      const id = getOrCreateCorrelationId(existingId)
      expect(id).toBe(existingId)
    })

    it('generates new ID when none provided', () => {
      const id = getOrCreateCorrelationId(null)
      expect(id).toBeTruthy()
      expect(id).not.toBeNull()
    })
  })

  describe('Error response creation', () => {
    it('creates error response with all required fields', () => {
      const response = createErrorResponse(
        'Test error',
        ERROR_CODES.VALIDATION_ERROR,
        'req-123',
        400
      )

      expect(response.status).toBe(400)
    })

    it('includes error code in response', async () => {
      const response = createErrorResponse(
        'Validation failed',
        ERROR_CODES.VALIDATION_ERROR,
        'req-123',
        400
      )

      const json = await response.json()
      expect(json.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    })

    it('includes request ID in response', async () => {
      const requestId = 'req-456'
      const response = createErrorResponse(
        'Error',
        ERROR_CODES.INTERNAL_ERROR,
        requestId,
        500
      )

      const json = await response.json()
      expect(json.requestId).toBe(requestId)
    })

    it('includes optional details', async () => {
      const details = { field: 'email', reason: 'invalid format' }
      const response = createErrorResponse(
        'Validation failed',
        ERROR_CODES.VALIDATION_ERROR,
        'req-123',
        400,
        details
      )

      const json = await response.json()
      expect(json.details).toEqual(details)
    })
  })

  describe('Success response creation', () => {
    it('creates success response with data', () => {
      const data = { id: '123', name: 'test' }
      const response = createSuccessResponse(data, 'req-123')

      expect(response.success).toBe(true)
      expect(response.data).toEqual(data)
    })

    it('includes request ID', () => {
      const response = createSuccessResponse(null, 'req-789')

      expect(response.requestId).toBe('req-789')
    })

    it('includes timestamp', () => {
      const response = createSuccessResponse({}, 'req-123')

      expect(response.timestamp).toBeTruthy()
      expect(new Date(response.timestamp).getTime()).toBeLessThanOrEqual(Date.now())
    })
  })

  describe('HTTP status code mapping', () => {
    it('maps auth errors to 401', () => {
      expect(getHttpStatus(ERROR_CODES.AUTH_INVALID)).toBe(401)
      expect(getHttpStatus(ERROR_CODES.AUTH_EXPIRED)).toBe(401)
      expect(getHttpStatus(ERROR_CODES.AUTH_MISSING)).toBe(401)
    })

    it('maps permission errors to 403', () => {
      expect(getHttpStatus(ERROR_CODES.INSUFFICIENT_PERMISSIONS)).toBe(403)
    })

    it('maps validation errors to 400', () => {
      expect(getHttpStatus(ERROR_CODES.VALIDATION_ERROR)).toBe(400)
      expect(getHttpStatus(ERROR_CODES.INVALID_INPUT)).toBe(400)
    })

    it('maps rate limit to 429', () => {
      expect(getHttpStatus(ERROR_CODES.RATE_LIMIT_EXCEEDED)).toBe(429)
    })

    it('maps not found to 404', () => {
      expect(getHttpStatus(ERROR_CODES.NOT_FOUND)).toBe(404)
      expect(getHttpStatus(ERROR_CODES.RESOURCE_NOT_FOUND)).toBe(404)
    })

    it('maps conflict to 409', () => {
      expect(getHttpStatus(ERROR_CODES.CONFLICT)).toBe(409)
    })

    it('maps server errors to 500', () => {
      expect(getHttpStatus(ERROR_CODES.INTERNAL_ERROR)).toBe(500)
    })

    it('maps service unavailable to 503', () => {
      expect(getHttpStatus(ERROR_CODES.SERVICE_UNAVAILABLE)).toBe(503)
    })
  })

  describe('Safe error messages', () => {
    it('returns safe validation error in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const error = new Error('validation failed: email is invalid')
      const message = getSafeErrorMessage(error, 'Default message')

      expect(message).toBe(error.message)

      process.env.NODE_ENV = originalEnv
    })

    it('returns default message for non-validation errors in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const error = new Error('Database connection failed')
      const message = getSafeErrorMessage(error, 'Default message')

      expect(message).toBe('Default message')

      process.env.NODE_ENV = originalEnv
    })

    it('returns full error message in development', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const error = new Error('Some internal error')
      const message = getSafeErrorMessage(error, 'Default')

      expect(message).toBe(error.message)

      process.env.NODE_ENV = originalEnv
    })

    it('returns default for non-Error objects', () => {
      const message = getSafeErrorMessage(null, 'Default message')
      expect(message).toBe('Default message')
    })
  })

  describe('Error details extraction', () => {
    it('extracts Error object details', () => {
      const error = new Error('Test error')
      const details = getErrorDetails(error)

      expect(details.message).toBe('Test error')
      expect(details.name).toBe('Error')
      expect(details.stack).toBeTruthy()
    })

    it('extracts string error details', () => {
      const details = getErrorDetails('String error')

      expect(details.message).toBe('String error')
    })

    it('handles unknown error types', () => {
      const details = getErrorDetails({ custom: 'error' })

      expect(details.message).toBe('Unknown error')
    })
  })

  describe('Route error handling', () => {
    it('handles syntax errors', () => {
      const error = new SyntaxError('Invalid JSON')
      const { response, statusCode } = handleRouteError(error, 'req-123', {
        method: 'POST',
        path: '/api/test',
      })

      expect(statusCode).toBe(400)
      expect(response.status).toBe(400)
    })

    it('handles validation errors', async () => {
      const error = new Error('validation failed on field email')
      const { response, statusCode } = handleRouteError(error, 'req-123', {
        method: 'POST',
        path: '/api/test',
      })

      expect(statusCode).toBe(400)
      const json = await response.json()
      expect(json.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    })

    it('handles file not found errors', () => {
      const error = new Error('ENOENT: no such file or directory')
      const { response, statusCode } = handleRouteError(error, 'req-123', {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(404)
    })

    it('handles permission errors', () => {
      const error = new Error('EACCES: permission denied')
      const { response, statusCode } = handleRouteError(error, 'req-123', {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(403)
    })

    it('handles timeout errors', () => {
      const error = new Error('Request timeout after 30s')
      const { response, statusCode } = handleRouteError(error, 'req-123', {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(503)
    })

    it('includes context in error response', async () => {
      const error = new Error('Test error')
      const context = {
        method: 'POST',
        path: '/api/users',
        userId: 'user-123',
      }
      const { response } = handleRouteError(error, 'req-123', context)

      const json = await response.json()
      expect(json.requestId).toBe('req-123')
    })
  })

  describe('Error codes', () => {
    it('includes all required error codes', () => {
      expect(ERROR_CODES.AUTH_MISSING).toBeDefined()
      expect(ERROR_CODES.AUTH_INVALID).toBeDefined()
      expect(ERROR_CODES.AUTH_EXPIRED).toBeDefined()
      expect(ERROR_CODES.INSUFFICIENT_PERMISSIONS).toBeDefined()
      expect(ERROR_CODES.VALIDATION_ERROR).toBeDefined()
      expect(ERROR_CODES.INVALID_INPUT).toBeDefined()
      expect(ERROR_CODES.RATE_LIMIT_EXCEEDED).toBeDefined()
      expect(ERROR_CODES.INTERNAL_ERROR).toBeDefined()
      expect(ERROR_CODES.SERVICE_UNAVAILABLE).toBeDefined()
      expect(ERROR_CODES.NOT_FOUND).toBeDefined()
      expect(ERROR_CODES.RESOURCE_NOT_FOUND).toBeDefined()
      expect(ERROR_CODES.CONFLICT).toBeDefined()
    })

    it('error codes are unique', () => {
      const codes = Object.values(ERROR_CODES)
      const uniqueCodes = new Set(codes)
      expect(uniqueCodes.size).toBe(codes.length)
    })
  })
})

describe('Error Handling Integration', () => {
  it('correlates errors across requests', () => {
    const id1 = getOrCreateCorrelationId()
    const id2 = getOrCreateCorrelationId()

    expect(id1).not.toBe(id2)
  })

  it('preserves error details through response cycle', async () => {
    const originalError = new Error('Original error message')
    const { response } = handleRouteError(originalError, 'req-123', {
      method: 'GET',
      path: '/api/test',
    })

    const json = await response.json()
    expect(json.error).toBeTruthy()
  })

  it('maintains safe error messages in production mode', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      const error = new Error('Database connection failed: secret_credential')
      const message = getSafeErrorMessage(error, 'Server error')

      // Should return safe default, not expose credentials
      expect(message).not.toContain('secret_credential')
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })
})

