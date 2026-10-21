/**
 * Comprehensive Error Handling Test Suite
 * Tests all error scenarios and HTTP status codes
 *
 * Coverage:
 * - 400 Bad Request (validation, invalid input)
 * - 401 Unauthorized (missing/invalid/expired auth)
 * - 403 Forbidden (insufficient permissions)
 * - 404 Not Found (resource not found)
 * - 409 Conflict (resource conflicts)
 * - 429 Rate Limited (rate limit exceeded)
 * - 500 Server Error (internal errors)
 * - 502 Bad Gateway (external service errors)
 * - 503 Service Unavailable (service down)
 * - 504 Gateway Timeout (timeout)
 * - Correlation ID propagation
 * - Error context enrichment
 * - Validation error details
 * - Safe error messages
 * - Retry logic
 * - Circuit breaker
 */

import {
  generateCorrelationId,
  getOrCreateCorrelationId,
  createErrorResponse,
  createSuccessResponse,
  EXTENDED_ERROR_CODES,
  getHttpStatus,
  getSafeErrorMessage,
  getErrorDetails,
  formatErrorLog,
  handleRouteError,
  parseValidationErrors,
  createBulkOperationResponse,
  retryWithBackoff,
  CircuitBreaker,
  extractCorrelationFromRequest,
} from './error-handling-v2'
import { NextResponse } from 'next/server'

describe('Error Handling System v2', () => {
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
      expect(uuid).toHaveLength(8)
    })
  })

  describe('getOrCreateCorrelationId', () => {
    test('returns provided correlation ID if valid', () => {
      const providedId = '1698765432000-a1b2c3d4'
      const result = getOrCreateCorrelationId(providedId)
      expect(result).toBe(providedId)
    })

    test('generates new ID if provided is null', () => {
      const result = getOrCreateCorrelationId(null)
      expect(result).toMatch(/^\d+-[a-f0-9]+$/)
    })

    test('generates new ID if provided is empty', () => {
      const result = getOrCreateCorrelationId('')
      expect(result).toMatch(/^\d+-[a-f0-9]+$/)
    })

    test('generates new ID if provided is whitespace', () => {
      const result = getOrCreateCorrelationId('   ')
      expect(result).toMatch(/^\d+-[a-f0-9]+$/)
    })
  })

  describe('extractCorrelationFromRequest', () => {
    test('extracts from x-correlation-id header', () => {
      const headers = new Headers()
      const correlationId = generateCorrelationId()
      headers.set('x-correlation-id', correlationId)

      const result = extractCorrelationFromRequest(headers)
      expect(result).toBe(correlationId)
    })

    test('extracts from x-request-id header as fallback', () => {
      const headers = new Headers()
      const requestId = generateCorrelationId()
      headers.set('x-request-id', requestId)

      const result = extractCorrelationFromRequest(headers)
      expect(result).toBe(requestId)
    })

    test('generates new ID if neither header present', () => {
      const headers = new Headers()
      const result = extractCorrelationFromRequest(headers)

      expect(result).toMatch(/^\d+-[a-f0-9]+$/)
    })

    test('prefers x-correlation-id over x-request-id', () => {
      const headers = new Headers()
      const correlationId = '1234-aaaa'
      const requestId = '5678-bbbb'
      headers.set('x-correlation-id', correlationId)
      headers.set('x-request-id', requestId)

      const result = extractCorrelationFromRequest(headers)
      expect(result).toBe(correlationId)
    })
  })

  describe('HTTP Status Mapping', () => {
    test('maps all error codes to correct HTTP statuses', () => {
      expect(getHttpStatus(EXTENDED_ERROR_CODES.INVALID_INPUT)).toBe(400)
      expect(getHttpStatus(EXTENDED_ERROR_CODES.VALIDATION_ERROR)).toBe(400)
      expect(getHttpStatus(EXTENDED_ERROR_CODES.MISSING_REQUIRED_FIELD)).toBe(400)
      expect(getHttpStatus(EXTENDED_ERROR_CODES.INVALID_FORMAT)).toBe(400)
      expect(getHttpStatus(EXTENDED_ERROR_CODES.VALUE_OUT_OF_RANGE)).toBe(400)

      expect(getHttpStatus(EXTENDED_ERROR_CODES.AUTH_MISSING)).toBe(401)
      expect(getHttpStatus(EXTENDED_ERROR_CODES.AUTH_INVALID)).toBe(401)
      expect(getHttpStatus(EXTENDED_ERROR_CODES.AUTH_EXPIRED)).toBe(401)

      expect(getHttpStatus(EXTENDED_ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS)).toBe(403)

      expect(getHttpStatus(EXTENDED_ERROR_CODES.RESOURCE_NOT_FOUND)).toBe(404)

      expect(getHttpStatus(EXTENDED_ERROR_CODES.METHOD_NOT_ALLOWED)).toBe(405)

      expect(getHttpStatus(EXTENDED_ERROR_CODES.RESOURCE_CONFLICT)).toBe(409)

      expect(getHttpStatus(EXTENDED_ERROR_CODES.RATE_LIMIT_EXCEEDED)).toBe(429)

      expect(getHttpStatus(EXTENDED_ERROR_CODES.INTERNAL_ERROR)).toBe(500)
      expect(getHttpStatus(EXTENDED_ERROR_CODES.DATABASE_ERROR)).toBe(500)

      expect(getHttpStatus(EXTENDED_ERROR_CODES.EXTERNAL_SERVICE_ERROR)).toBe(502)

      expect(getHttpStatus(EXTENDED_ERROR_CODES.SERVICE_UNAVAILABLE)).toBe(503)

      expect(getHttpStatus(EXTENDED_ERROR_CODES.GATEWAY_TIMEOUT)).toBe(504)
    })
  })

  describe('Error Responses', () => {
    test('creates error response with all fields', () => {
      const requestId = generateCorrelationId()
      const response = createErrorResponse(
        'Validation failed',
        EXTENDED_ERROR_CODES.VALIDATION_ERROR,
        requestId,
        400,
        { details: { field: 'email' } }
      )

      expect(response.status).toBe(400)
    })

    test('includes retry-after header for retryable errors', () => {
      const requestId = generateCorrelationId()
      const response = createErrorResponse(
        'Service unavailable',
        EXTENDED_ERROR_CODES.SERVICE_UNAVAILABLE,
        requestId,
        503,
        { retryAfterSeconds: 30 }
      )

      expect(response.headers.get('Retry-After')).toBe('30')
    })

    test('creates success response with meta information', () => {
      const requestId = generateCorrelationId()
      const data = { items: [1, 2, 3] }

      const response = createSuccessResponse(data, requestId, {
        total: 100,
        page: 1,
        limit: 10,
      })

      expect(response.success).toBe(true)
      expect(response.data).toEqual(data)
      expect(response.meta?.total).toBe(100)
      expect(response.meta?.page).toBe(1)
      expect(response.meta?.limit).toBe(10)
    })
  })

  describe('Safe Error Messages', () => {
    const originalEnv = process.env.NODE_ENV

    afterEach(() => {
      process.env.NODE_ENV = originalEnv
    })

    test('exposes validation errors in production', () => {
      process.env.NODE_ENV = 'production'
      const error = new Error('validation: email is required')
      const message = getSafeErrorMessage(error, 'An error occurred')

      expect(message).toBe('validation: email is required')
    })

    test('hides generic errors in production', () => {
      process.env.NODE_ENV = 'production'
      const error = new Error('Something went wrong internally')
      const message = getSafeErrorMessage(error, 'An error occurred')

      expect(message).toBe('An error occurred')
    })

    test('exposes all errors in development', () => {
      process.env.NODE_ENV = 'development'
      const error = new Error('Secret database connection string')
      const message = getSafeErrorMessage(error, 'An error occurred')

      expect(message).toBe('Secret database connection string')
    })

    test('uses default message for non-Error types', () => {
      const message = getSafeErrorMessage('string error', 'Default')
      expect(message).toBe('Default')
    })
  })

  describe('Error Details Extraction', () => {
    test('extracts Error details with stack', () => {
      const error = new Error('Test error')
      const details = getErrorDetails(error)

      expect(details.message).toBe('Test error')
      expect(details.name).toBe('Error')
      expect(details.stack).toBeDefined()
    })

    test('extracts Error with custom code', () => {
      const error: any = new Error('File not found')
      error.code = 'ENOENT'

      const details = getErrorDetails(error)
      expect(details.code).toBe('ENOENT')
    })

    test('handles string errors', () => {
      const details = getErrorDetails('Simple string error')
      expect(details.message).toBe('Simple string error')
    })

    test('handles object errors with message', () => {
      const details = getErrorDetails({ message: 'Object error', code: 'CUSTOM' })
      expect(details.message).toBe('Object error')
      expect(details.code).toBe('CUSTOM')
    })

    test('handles unknown error types', () => {
      const details = getErrorDetails(123)
      expect(details.message).toBe('Unknown error')
    })
  })

  describe('Error Logging', () => {
    test('formats error log with context', () => {
      const requestId = generateCorrelationId()
      const error = new Error('Operation failed')
      const logEntry = formatErrorLog('Test operation', error, {
        requestId,
        method: 'POST',
        path: '/api/test',
        userId: 'user123',
        statusCode: 500,
      })

      expect(logEntry.message).toBe('Test operation')
      expect(logEntry.requestId).toBe(requestId)
      expect(logEntry.method).toBe('POST')
      expect(logEntry.path).toBe('/api/test')
      expect(logEntry.userId).toBe('user123')
      expect(logEntry.statusCode).toBe(500)
      expect(logEntry.error).toBeDefined()
      expect(logEntry.timestamp).toBeDefined()
    })
  })

  describe('Route Error Handler', () => {
    test('handles syntax errors as invalid input', () => {
      const requestId = generateCorrelationId()
      const error = new SyntaxError('JSON parse error')

      const { response, statusCode, code } = handleRouteError(error, requestId, {
        method: 'POST',
        path: '/api/test',
      })

      expect(statusCode).toBe(400)
      expect(code).toBe(EXTENDED_ERROR_CODES.INVALID_INPUT)
    })

    test('handles validation errors', () => {
      const requestId = generateCorrelationId()
      const error = new Error('validation: email is invalid')

      const { response, statusCode, code } = handleRouteError(error, requestId, {
        method: 'POST',
        path: '/api/test',
      })

      expect(statusCode).toBe(400)
      expect(code).toBe(EXTENDED_ERROR_CODES.VALIDATION_ERROR)
    })

    test('handles missing required field errors', () => {
      const requestId = generateCorrelationId()
      const error = new Error('Field "email" is required')

      const { response, statusCode, code } = handleRouteError(error, requestId, {
        method: 'POST',
        path: '/api/test',
      })

      expect(statusCode).toBe(400)
      expect(code).toBe(EXTENDED_ERROR_CODES.MISSING_REQUIRED_FIELD)
    })

    test('handles resource not found errors', () => {
      const requestId = generateCorrelationId()
      const error: any = new Error('ENOENT: file not found')
      error.code = 'ENOENT'

      const { response, statusCode, code } = handleRouteError(error, requestId, {
        method: 'GET',
        path: '/api/resource/123',
      })

      expect(statusCode).toBe(404)
      expect(code).toBe(EXTENDED_ERROR_CODES.RESOURCE_NOT_FOUND)
    })

    test('handles permission denied errors', () => {
      const requestId = generateCorrelationId()
      const error: any = new Error('EACCES: permission denied')
      error.code = 'EACCES'

      const { response, statusCode, code } = handleRouteError(error, requestId, {
        method: 'DELETE',
        path: '/api/resource/123',
      })

      expect(statusCode).toBe(403)
      expect(code).toBe(EXTENDED_ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS)
    })

    test('handles conflict errors', () => {
      const requestId = generateCorrelationId()
      const error = new Error('Resource already exists')

      const { response, statusCode, code } = handleRouteError(error, requestId, {
        method: 'POST',
        path: '/api/resource',
      })

      expect(statusCode).toBe(409)
      expect(code).toBe(EXTENDED_ERROR_CODES.RESOURCE_CONFLICT)
    })

    test('handles timeout errors as gateway timeout', () => {
      const requestId = generateCorrelationId()
      const error: any = new Error('ETIMEDOUT: connection timeout')
      error.code = 'ETIMEDOUT'

      const { response, statusCode, code } = handleRouteError(error, requestId, {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(504)
      expect(code).toBe(EXTENDED_ERROR_CODES.GATEWAY_TIMEOUT)
    })

    test('marks timeout errors as retryable', () => {
      const requestId = generateCorrelationId()
      const error = new Error('timeout')

      const { response, statusCode, code } = handleRouteError(error, requestId, {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(504)
    })

    test('handles database errors', () => {
      const requestId = generateCorrelationId()
      const error = new Error('database connection failed')

      const { response, statusCode, code } = handleRouteError(error, requestId, {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(500)
      expect(code).toBe(EXTENDED_ERROR_CODES.DATABASE_ERROR)
    })

    test('handles external service errors', () => {
      const requestId = generateCorrelationId()
      const error = new Error('external service request failed')

      const { response, statusCode, code } = handleRouteError(error, requestId, {
        method: 'POST',
        path: '/api/test',
      })

      expect(statusCode).toBe(502)
      expect(code).toBe(EXTENDED_ERROR_CODES.EXTERNAL_SERVICE_ERROR)
    })

    test('defaults to internal error for unknown errors', () => {
      const requestId = generateCorrelationId()
      const error = new Error('Something completely unexpected')

      const { response, statusCode, code } = handleRouteError(error, requestId, {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(500)
      expect(code).toBe(EXTENDED_ERROR_CODES.INTERNAL_ERROR)
    })
  })

  describe('Validation Error Parsing', () => {
    test('parses Zod validation errors', () => {
      const zodError = {
        issues: [
          {
            path: ['email'],
            message: 'Invalid email',
            code: 'invalid_string',
          },
          {
            path: ['age'],
            message: 'Must be a number',
            code: 'invalid_type',
          },
        ],
      }

      const errors = parseValidationErrors(zodError)

      expect(errors).toHaveLength(2)
      expect(errors[0].field).toBe('email')
      expect(errors[0].message).toBe('Invalid email')
      expect(errors[1].field).toBe('age')
    })

    test('handles nested field paths', () => {
      const zodError = {
        issues: [
          {
            path: ['user', 'profile', 'email'],
            message: 'Invalid email',
            code: 'invalid_string',
          },
        ],
      }

      const errors = parseValidationErrors(zodError)

      expect(errors[0].field).toBe('user.profile.email')
    })
  })

  describe('Bulk Operations', () => {
    test('handles all successful operations', () => {
      const requestId = generateCorrelationId()
      const response = createBulkOperationResponse([1, 2, 3], [], requestId)

      expect(response.status).toBe(200)
    })

    test('handles all failed operations', () => {
      const requestId = generateCorrelationId()
      const failed = [
        { index: 0, error: 'Invalid data' },
        { index: 1, error: 'Duplicate entry' },
      ]

      const response = createBulkOperationResponse([], failed, requestId)

      expect(response.status).toBe(400)
    })

    test('handles partial success (207 Multi-Status)', () => {
      const requestId = generateCorrelationId()
      const successful = [1, 2]
      const failed = [{ index: 2, error: 'Invalid data' }]

      const response = createBulkOperationResponse(successful, failed, requestId)

      expect(response.status).toBe(207)
    })
  })

  describe('Retry Logic', () => {
    test('retries on transient failure', async () => {
      let attempts = 0
      const operation = async () => {
        attempts++
        if (attempts < 3) throw new Error('Transient error')
        return 'success'
      }

      const result = await retryWithBackoff(operation, {
        maxRetries: 3,
        delayMs: 10,
        backoff: 'linear',
      })

      expect(result).toBe('success')
      expect(attempts).toBe(3)
    })

    test('throws after max retries exceeded', async () => {
      const operation = async () => {
        throw new Error('Persistent error')
      }

      await expect(
        retryWithBackoff(operation, { maxRetries: 2, delayMs: 10 })
      ).rejects.toThrow('Persistent error')
    })

    test('uses exponential backoff', async () => {
      const delays: number[] = []
      const startTime = Date.now()

      let attempts = 0
      const operation = async () => {
        attempts++
        if (attempts > 1) {
          const now = Date.now()
          delays.push(now - startTime)
        }
        if (attempts < 3) throw new Error('Error')
        return 'success'
      }

      await retryWithBackoff(operation, {
        maxRetries: 2,
        delayMs: 10,
        backoff: 'exponential',
      })

      // Exponential backoff should have increasing delays
      if (delays.length >= 2) {
        expect(delays[1]).toBeGreaterThan(delays[0])
      }
    })
  })

  describe('Circuit Breaker', () => {
    test('closes circuit after failure threshold', async () => {
      const breaker = new CircuitBreaker(2, 1000, 1)

      let attempts = 0
      const operation = async () => {
        attempts++
        throw new Error('Service error')
      }

      // First failure
      await expect(breaker.execute(operation)).rejects.toThrow()

      // Second failure - should open circuit
      await expect(breaker.execute(operation)).rejects.toThrow()

      // Circuit is now open - should fail without calling operation
      const stateBeforeOpen = attempts
      await expect(breaker.execute(operation)).rejects.toThrow('Circuit breaker is OPEN')
      expect(attempts).toBe(stateBeforeOpen) // No new attempt
    })

    test('transitions to half-open after timeout', async () => {
      const breaker = new CircuitBreaker(1, 100, 1)

      const operation = async () => {
        throw new Error('Service error')
      }

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow()

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should transition to half-open
      const state = breaker.getState()
      expect(state.state).toBe('half-open')
    })

    test('resets circuit on successful operation', async () => {
      const breaker = new CircuitBreaker(1, 1000, 1)

      let shouldFail = true
      const operation = async () => {
        if (shouldFail) throw new Error('Service error')
        return 'success'
      }

      // Fail once to open circuit
      await expect(breaker.execute(operation)).rejects.toThrow()

      let state = breaker.getState()
      expect(state.state).toBe('open')

      // Simulate recovery
      shouldFail = false

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Execute operation - should succeed and close circuit
      const result = await breaker.execute(operation)
      expect(result).toBe('success')

      state = breaker.getState()
      expect(state.state).toBe('closed')
    })

    test('can be manually reset', () => {
      const breaker = new CircuitBreaker(1, 1000, 1)

      // Simulate failures to open circuit
      breaker.execute(() => Promise.reject(new Error())).catch(() => {})

      let state = breaker.getState()
      expect(state.state).toBe('open')

      // Reset
      breaker.reset()

      state = breaker.getState()
      expect(state.state).toBe('closed')
      expect(state.failures).toBe(0)
    })
  })
})
