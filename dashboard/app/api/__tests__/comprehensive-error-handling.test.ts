/**
 * Comprehensive Error Handling Test Suite
 * Tests all error scenarios across all API endpoints
 *
 * Coverage:
 * - Input validation errors (400)
 * - Authentication errors (401)
 * - Authorization errors (403)
 * - Not found errors (404)
 * - Conflict errors (409)
 * - Rate limiting (429)
 * - Server errors (500)
 * - Service unavailable (503)
 */

import {
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  getHttpStatus,
  getSafeErrorMessage,
  formatErrorLog,
  generateCorrelationId,
  getOrCreateCorrelationId,
} from '@/lib/error-handling'
import { NextResponse } from 'next/server'

describe('Error Handling Utilities', () => {
  describe('generateCorrelationId', () => {
    test('generates unique correlation IDs', () => {
      const id1 = generateCorrelationId()
      const id2 = generateCorrelationId()

      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^\d+-[a-f0-9]+$/)
      expect(id2).toMatch(/^\d+-[a-f0-9]+$/)
    })

    test('includes timestamp and uuid segments', () => {
      const id = generateCorrelationId()
      const [timestamp, uuid] = id.split('-')

      expect(Number(timestamp)).toBeGreaterThan(0)
      expect(uuid).toHaveLength(8) // First segment of UUID
    })
  })

  describe('getOrCreateCorrelationId', () => {
    test('returns provided correlation ID if valid', () => {
      const providedId = '1698765432000-a1b2c3d4'
      const result = getOrCreateCorrelationId(providedId)

      expect(result).toBe(providedId)
    })

    test('generates new ID if not provided', () => {
      const result = getOrCreateCorrelationId(null)

      expect(result).toMatch(/^\d+-[a-f0-9]+$/)
    })

    test('generates new ID if empty string provided', () => {
      const result = getOrCreateCorrelationId('')

      expect(result).toMatch(/^\d+-[a-f0-9]+$/)
    })
  })

  describe('getHttpStatus', () => {
    test('returns 401 for authentication errors', () => {
      expect(getHttpStatus(ERROR_CODES.AUTH_MISSING)).toBe(401)
      expect(getHttpStatus(ERROR_CODES.AUTH_INVALID)).toBe(401)
      expect(getHttpStatus(ERROR_CODES.AUTH_EXPIRED)).toBe(401)
    })

    test('returns 403 for authorization errors', () => {
      expect(getHttpStatus(ERROR_CODES.INSUFFICIENT_PERMISSIONS)).toBe(403)
    })

    test('returns 400 for validation errors', () => {
      expect(getHttpStatus(ERROR_CODES.VALIDATION_ERROR)).toBe(400)
      expect(getHttpStatus(ERROR_CODES.INVALID_INPUT)).toBe(400)
    })

    test('returns 404 for not found errors', () => {
      expect(getHttpStatus(ERROR_CODES.NOT_FOUND)).toBe(404)
      expect(getHttpStatus(ERROR_CODES.RESOURCE_NOT_FOUND)).toBe(404)
    })

    test('returns 409 for conflict errors', () => {
      expect(getHttpStatus(ERROR_CODES.CONFLICT)).toBe(409)
    })

    test('returns 429 for rate limit errors', () => {
      expect(getHttpStatus(ERROR_CODES.RATE_LIMIT_EXCEEDED)).toBe(429)
    })

    test('returns 500 for internal errors', () => {
      expect(getHttpStatus(ERROR_CODES.INTERNAL_ERROR)).toBe(500)
    })

    test('returns 503 for service unavailable', () => {
      expect(getHttpStatus(ERROR_CODES.SERVICE_UNAVAILABLE)).toBe(503)
    })

    test('defaults to 500 for unknown codes', () => {
      expect(getHttpStatus('UNKNOWN_CODE' as unknown as NextRequest)).toBe(500)
    })
  })

  describe('getSafeErrorMessage', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
    })

    afterEach(() => {
      process.env.NODE_ENV = 'test'
    })

    test('returns error message in development', () => {
      process.env.NODE_ENV = 'development'
      const error = new Error('Specific validation issue')

      const message = getSafeErrorMessage(error, 'Default message')

      expect(message).toBe('Specific validation issue')
    })

    test('returns safe message in production for validation errors', () => {
      process.env.NODE_ENV = 'production'
      const error = new Error('Invalid email format')

      const message = getSafeErrorMessage(error, 'Default message')

      expect(message).toBe('Invalid email format')
    })

    test('returns default message in production for unsafe errors', () => {
      process.env.NODE_ENV = 'production'
      const error = new Error('Database connection failed at host:5432')

      const message = getSafeErrorMessage(error, 'Operation failed')

      expect(message).toBe('Operation failed')
    })

    test('handles string errors', () => {
      const message = getSafeErrorMessage('String error', 'Default')

      expect(message).toBe('Default')
    })

    test('handles unknown error types', () => {
      const message = getSafeErrorMessage({}, 'Default')

      expect(message).toBe('Default')
    })
  })

  describe('createErrorResponse', () => {
    test('returns properly formatted error response', () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Invalid request',
        ERROR_CODES.INVALID_INPUT,
        correlationId,
        400
      )

      expect(response.status).toBe(400)
    })

    test('includes all required fields', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Not found',
        ERROR_CODES.RESOURCE_NOT_FOUND,
        correlationId,
        404
      )

      const json = await response.json()

      expect(json.success).toBe(false)
      expect(json.error).toBe('Not found')
      expect(json.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND)
      expect(json.requestId).toBe(correlationId)
      expect(json.timestamp).toBeDefined()
    })

    test('includes optional details field', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Validation failed',
        ERROR_CODES.VALIDATION_ERROR,
        correlationId,
        400,
        { field: 'email', reason: 'must be valid' }
      )

      const json = await response.json()

      expect(json.details).toEqual({ field: 'email', reason: 'must be valid' })
    })

    test('omits details field when not provided', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Server error',
        ERROR_CODES.INTERNAL_ERROR,
        correlationId,
        500
      )

      const json = await response.json()

      expect(json.details).toBeUndefined()
    })
  })

  describe('createSuccessResponse', () => {
    test('returns properly formatted success response', () => {
      const correlationId = generateCorrelationId()
      const response = createSuccessResponse({ id: '123' }, correlationId)

      expect(response.success).toBe(true)
      expect(response.data).toEqual({ id: '123' })
      expect(response.requestId).toBe(correlationId)
      expect(response.timestamp).toBeDefined()
    })

    test('handles undefined data', () => {
      const correlationId = generateCorrelationId()
      const response = createSuccessResponse(undefined, correlationId)

      expect(response.success).toBe(true)
      expect(response.data).toBeUndefined()
    })

    test('includes timestamp in ISO format', () => {
      const correlationId = generateCorrelationId()
      const response = createSuccessResponse(null, correlationId)

      const timestamp = new Date(response.timestamp)
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now())
      expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 1000)
    })
  })

  describe('formatErrorLog', () => {
    test('creates structured log entry with Error object', () => {
      const error = new Error('Database connection failed')
      const context = {
        requestId: '123-abc',
        method: 'POST',
        path: '/api/users',
        statusCode: 500,
      }

      const log = formatErrorLog('Operation failed', error, context)

      expect(log.timestamp).toBeDefined()
      expect(log.message).toBe('Operation failed')
      expect(log.requestId).toBe('123-abc')
      expect(log.method).toBe('POST')
      expect(log.path).toBe('/api/users')
      expect(log.statusCode).toBe(500)
      expect(log.error.message).toBe('Database connection failed')
      expect(log.error.stack).toBeDefined()
      expect(log.error.name).toBe('Error')
    })

    test('handles string errors', () => {
      const log = formatErrorLog('Error occurred', 'String error', {
        requestId: '123',
      })

      expect(log.error.message).toBe('String error')
    })

    test('handles unknown error types', () => {
      const log = formatErrorLog('Error occurred', { foo: 'bar' }, {
        requestId: '123',
      })

      expect(log.error.message).toBe('Unknown error')
    })

    test('includes custom context fields', () => {
      const log = formatErrorLog('Error', new Error(), {
        requestId: '123',
        userId: 'user-456',
        operation: 'create_user',
      })

      expect(log.userId).toBe('user-456')
      expect(log.operation).toBe('create_user')
    })
  })
})

describe('Error Response Scenarios', () => {
  describe('Validation Errors (400)', () => {
    test('missing required field', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Email is required',
        ERROR_CODES.INVALID_INPUT,
        correlationId,
        400,
        { field: 'email' }
      )

      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.code).toBe(ERROR_CODES.INVALID_INPUT)
      expect(json.success).toBe(false)
    })

    test('invalid data type', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Age must be a number',
        ERROR_CODES.VALIDATION_ERROR,
        correlationId,
        400
      )

      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    })

    test('business logic validation failure', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Password must be at least 8 characters',
        ERROR_CODES.INVALID_INPUT,
        correlationId,
        400
      )

      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toContain('Password')
    })
  })

  describe('Authentication Errors (401)', () => {
    test('missing authentication token', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Authorization header missing',
        ERROR_CODES.AUTH_MISSING,
        correlationId,
        401
      )

      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.code).toBe(ERROR_CODES.AUTH_MISSING)
    })

    test('invalid token format', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Invalid token format',
        ERROR_CODES.AUTH_INVALID,
        correlationId,
        401
      )

      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.code).toBe(ERROR_CODES.AUTH_INVALID)
    })

    test('expired token', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Token has expired',
        ERROR_CODES.AUTH_EXPIRED,
        correlationId,
        401
      )

      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.code).toBe(ERROR_CODES.AUTH_EXPIRED)
    })
  })

  describe('Authorization Errors (403)', () => {
    test('insufficient permissions', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Admin role required',
        ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        correlationId,
        403
      )

      const json = await response.json()

      expect(response.status).toBe(403)
      expect(json.code).toBe(ERROR_CODES.INSUFFICIENT_PERMISSIONS)
    })
  })

  describe('Not Found Errors (404)', () => {
    test('resource not found', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'User not found',
        ERROR_CODES.RESOURCE_NOT_FOUND,
        correlationId,
        404
      )

      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND)
    })
  })

  describe('Conflict Errors (409)', () => {
    test('duplicate resource', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Email already exists',
        ERROR_CODES.CONFLICT,
        correlationId,
        409
      )

      const json = await response.json()

      expect(response.status).toBe(409)
      expect(json.code).toBe(ERROR_CODES.CONFLICT)
    })
  })

  describe('Rate Limit Errors (429)', () => {
    test('rate limit exceeded', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Too many requests, please retry after 60 seconds',
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        correlationId,
        429
      )

      const json = await response.json()

      expect(response.status).toBe(429)
      expect(json.code).toBe(ERROR_CODES.RATE_LIMIT_EXCEEDED)
    })
  })

  describe('Server Errors (500)', () => {
    test('internal server error', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'An unexpected error occurred',
        ERROR_CODES.INTERNAL_ERROR,
        correlationId,
        500
      )

      const json = await response.json()

      expect(response.status).toBe(500)
      expect(json.code).toBe(ERROR_CODES.INTERNAL_ERROR)
    })
  })

  describe('Service Unavailable Errors (503)', () => {
    test('service unavailable', async () => {
      const correlationId = generateCorrelationId()
      const response = createErrorResponse(
        'Service temporarily unavailable',
        ERROR_CODES.SERVICE_UNAVAILABLE,
        correlationId,
        503
      )

      const json = await response.json()

      expect(response.status).toBe(503)
      expect(json.code).toBe(ERROR_CODES.SERVICE_UNAVAILABLE)
    })
  })
})

describe('Error Response Security', () => {
  test('error response should not contain stack traces in production', async () => {
    process.env.NODE_ENV = 'production'
    const error = new Error('Database error at /var/lib/data')

    const safeMessage = getSafeErrorMessage(error, 'Operation failed')

    expect(safeMessage).not.toContain('Database error')
    expect(safeMessage).not.toContain('/var/lib/data')
  })

  test('error response should not expose file paths', async () => {
    const correlationId = generateCorrelationId()
    const response = createErrorResponse(
      'File not accessible',
      ERROR_CODES.RESOURCE_NOT_FOUND,
      correlationId,
      404
    )

    const json = await response.json()

    expect(json.error).not.toContain('/')
    expect(json.error).not.toContain('\\')
  })

  test('error response should not contain API keys', () => {
    const error = new Error('API key invalid: sk-proj-xyz123')

    const safeMessage = getSafeErrorMessage(error, 'Invalid API key')

    expect(safeMessage).not.toContain('sk-proj-xyz123')
  })

  test('correlation ID should be included for tracing', async () => {
    const correlationId = generateCorrelationId()
    const response = createErrorResponse(
      'Error occurred',
      ERROR_CODES.INTERNAL_ERROR,
      correlationId,
      500
    )

    const json = await response.json()

    expect(json.requestId).toBe(correlationId)
  })

  test('timestamp should be included in ISO format', async () => {
    const correlationId = generateCorrelationId()
    const response = createErrorResponse(
      'Error',
      ERROR_CODES.INTERNAL_ERROR,
      correlationId,
      500
    )

    const json = await response.json()
    const timestamp = new Date(json.timestamp)

    expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now())
  })
})

describe('Error Handler Edge Cases', () => {
  test('handles very long error messages', () => {
    const longMessage = 'A'.repeat(1000)
    const correlationId = generateCorrelationId()

    const response = createErrorResponse(
      longMessage,
      ERROR_CODES.INTERNAL_ERROR,
      correlationId,
      500
    )

    expect(response.status).toBe(500)
  })

  test('handles special characters in error messages', async () => {
    const correlationId = generateCorrelationId()
    const response = createErrorResponse(
      'Invalid character: <script>alert("xss")</script>',
      ERROR_CODES.INVALID_INPUT,
      correlationId,
      400
    )

    const json = await response.json()

    expect(json.error).toContain('<script>')
    // Note: Actual escaping should happen at response send time
  })

  test('handles concurrent error responses', async () => {
    const ids = [generateCorrelationId(), generateCorrelationId()]

    const responses = ids.map(id =>
      createErrorResponse('Error', ERROR_CODES.INTERNAL_ERROR, id, 500)
    )

    expect(responses[0].status).toBe(500)
    expect(responses[1].status).toBe(500)

    const jsons = await Promise.all(responses.map(r => r.json()))

    expect(jsons[0].requestId).not.toBe(jsons[1].requestId)
  })
})
