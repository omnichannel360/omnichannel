import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import {
  CircuitBreaker,
  retryWithBackoff,
  DEFAULT_RETRY_CONFIG,
  withTimeout,
  sanitizeErrorDetails,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  getHttpStatus,
  getSafeErrorMessage,
  getErrorDetails,
  formatErrorLog,
  handleRouteError,
  extractCorrelationFromRequest,
} from '@/lib/error-handling'

describe('Error Handling - Comprehensive Suite', () => {
  describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(3, 2, 100)
    })

    it('should allow operations when CLOSED', async () => {
      const operation = jest.fn().mockResolvedValue('success')
      const result = await circuitBreaker.execute(operation)
      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(1)
    })

    it('should open after failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Failed'))

      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation)
        } catch (e) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN')

      await expect(circuitBreaker.execute(() => Promise.resolve('ok'))).rejects.toThrow(
        'Circuit breaker is OPEN'
      )
    })

    it('should transition to HALF_OPEN after timeout', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Failed'))

      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation)
        } catch (e) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN')

      await new Promise((resolve) => setTimeout(resolve, 150))

      const newOp = jest.fn().mockResolvedValue('recovered')
      const result = await circuitBreaker.execute(newOp)
      expect(result).toBe('recovered')
    })

    it('should close after success threshold in HALF_OPEN', async () => {
      // Force to OPEN state
      const failOp = jest.fn().mockRejectedValue(new Error('Fail'))
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failOp)
        } catch (e) {
          // Expected
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 150))

      // Transition to HALF_OPEN with successful operations
      const successOp = jest.fn().mockResolvedValue('ok')
      await circuitBreaker.execute(successOp)
      await circuitBreaker.execute(successOp)

      expect(circuitBreaker.getState()).toBe('CLOSED')
    })

    it('should go back to OPEN if fails in HALF_OPEN', async () => {
      // Force to OPEN
      const failOp = jest.fn().mockRejectedValue(new Error('Fail'))
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failOp)
        } catch (e) {
          // Expected
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 150))

      // Fail in HALF_OPEN state
      const failAgain = jest.fn().mockRejectedValue(new Error('Still failing'))
      try {
        await circuitBreaker.execute(failAgain)
      } catch (e) {
        // Expected
      }

      expect(circuitBreaker.getState()).toBe('OPEN')
    })
  })

  describe('retryWithBackoff', () => {
    it('should succeed on first try', async () => {
      const operation = jest.fn().mockResolvedValue('success')
      const result = await retryWithBackoff(operation)

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(1)
    })

    it('should retry on transient errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce('recovered')

      const result = await retryWithBackoff(operation, {
        ...DEFAULT_RETRY_CONFIG,
        maxRetries: 2,
        isRetryable: () => true,
      })

      expect(result).toBe('recovered')
      expect(operation).toHaveBeenCalledTimes(2)
    })

    it('should fail after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('persistent error'))

      await expect(
        retryWithBackoff(operation, {
          ...DEFAULT_RETRY_CONFIG,
          maxRetries: 2,
          isRetryable: () => true,
        })
      ).rejects.toThrow('persistent error')

      expect(operation).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
    })

    it('should respect isRetryable callback', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('not retryable'))

      await expect(
        retryWithBackoff(operation, {
          ...DEFAULT_RETRY_CONFIG,
          isRetryable: () => false,
        })
      ).rejects.toThrow('not retryable')

      expect(operation).toHaveBeenCalledTimes(1)
    })

    it('should detect timeout errors as retryable', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValueOnce('recovered')

      const result = await retryWithBackoff(operation, {
        ...DEFAULT_RETRY_CONFIG,
        maxRetries: 1,
      })

      expect(result).toBe('recovered')
      expect(operation).toHaveBeenCalledTimes(2)
    })

    it('should detect connection errors as retryable', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce('recovered')

      const result = await retryWithBackoff(operation, {
        ...DEFAULT_RETRY_CONFIG,
        maxRetries: 1,
      })

      expect(result).toBe('recovered')
    })

    it('should apply exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce('ok')

      const startTime = Date.now()
      await retryWithBackoff(operation, {
        maxRetries: 1,
        initialDelayMs: 50,
        maxDelayMs: 100,
        backoffMultiplier: 2,
        isRetryable: () => true,
      })
      const duration = Date.now() - startTime

      expect(duration).toBeGreaterThanOrEqual(50)
      expect(duration).toBeLessThan(500) // Should not be too long
    })
  })

  describe('withTimeout', () => {
    it('should complete before timeout', async () => {
      const promise = Promise.resolve('success')
      const result = await withTimeout(promise, 1000)
      expect(result).toBe('success')
    })

    it('should throw timeout error when exceeded', async () => {
      const promise = new Promise((resolve) => setTimeout(() => resolve('slow'), 2000))

      await expect(withTimeout(promise, 100, 'Too slow')).rejects.toThrow('Too slow')
    })

    it('should use default timeout message', async () => {
      const promise = new Promise((resolve) => setTimeout(() => resolve('ok'), 2000))

      await expect(withTimeout(promise, 100)).rejects.toThrow('Operation timeout')
    })

    it('should handle promise rejection', async () => {
      const promise = Promise.reject(new Error('Original error'))

      await expect(withTimeout(promise, 1000)).rejects.toThrow('Original error')
    })
  })

  describe('sanitizeErrorDetails', () => {
    it('should remove password fields', () => {
      const details = {
        userId: '123',
        password: 'secret123',
        email: 'user@example.com',
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized).toEqual({
        userId: '123',
        email: 'user@example.com',
      })
      expect(sanitized?.password).toBeUndefined()
    })

    it('should remove token fields', () => {
      const details = {
        userId: '123',
        apiToken: 'sk-xyz789',
        refreshToken: 'ref-abc123',
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.apiToken).toBeUndefined()
      expect(sanitized?.refreshToken).toBeUndefined()
    })

    it('should remove secret and key fields', () => {
      const details = {
        apiSecret: 'secret',
        privateKey: 'key123',
        secretKey: 'sk-xyz',
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.apiSecret).toBeUndefined()
      expect(sanitized?.privateKey).toBeUndefined()
      expect(sanitized?.secretKey).toBeUndefined()
    })

    it('should handle null and undefined input', () => {
      expect(sanitizeErrorDetails(null)).toBeUndefined()
      expect(sanitizeErrorDetails(undefined)).toBeUndefined()
    })

    it('should skip long strings', () => {
      const longString = 'x'.repeat(1000)
      const details = {
        longField: longString,
        shortField: 'ok',
        message: 'Error occurred',
      }

      const sanitized = sanitizeErrorDetails(details)
      expect(sanitized?.longField).toBeUndefined()
      expect(sanitized?.shortField).toBe('ok')
      expect(sanitized?.message).toBe('Error occurred') // short, non-sensitive: kept
    })

    it('should keep numbers and booleans', () => {
      const details = {
        statusCode: 500,
        retry: true,
        duration: 123.45,
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.statusCode).toBe(500)
      expect(sanitized?.retry).toBe(true)
      expect(sanitized?.duration).toBe(123.45)
    })

    it('should return undefined when all fields filtered', () => {
      const details = {
        password: 'secret',
        apiKey: 'key123',
      }

      const sanitized = sanitizeErrorDetails(details)
      expect(sanitized).toBeUndefined()
    })
  })

  describe('Error code mapping', () => {
    it('should map all error codes to HTTP status', () => {
      Object.values(ERROR_CODES).forEach((code) => {
        const status = getHttpStatus(code as unknown as NextRequest)
        expect(status).toBeGreaterThanOrEqual(400)
        expect(status).toBeLessThan(600)
      })
    })

    it('should map AUTH_MISSING to 401', () => {
      expect(getHttpStatus(ERROR_CODES.AUTH_MISSING)).toBe(401)
    })

    it('should map VALIDATION_ERROR to 400', () => {
      expect(getHttpStatus(ERROR_CODES.VALIDATION_ERROR)).toBe(400)
    })

    it('should map RATE_LIMIT_EXCEEDED to 429', () => {
      expect(getHttpStatus(ERROR_CODES.RATE_LIMIT_EXCEEDED)).toBe(429)
    })

    it('should default to 500 for unknown codes', () => {
      expect(getHttpStatus('UNKNOWN_CODE' as unknown as NextRequest)).toBe(500)
    })
  })

  describe('Safe error messages', () => {
    it('should return safe validation message in production', () => {
      const error = new Error('Invalid email format in field user.email')
      const env = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const message = getSafeErrorMessage(error, 'Default message')

      process.env.NODE_ENV = env
      expect(message).toBe('Invalid email format in field user.email')
    })

    it('should return default message for unsafe errors in production', () => {
      const error = new Error('SELECT * FROM users WHERE id = 1; DROP TABLE users;--')
      const env = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const message = getSafeErrorMessage(error, 'An error occurred')

      process.env.NODE_ENV = env
      expect(message).toBe('An error occurred')
    })

    it('should return error message in development', () => {
      const error = new Error('Detailed error message')
      const env = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const message = getSafeErrorMessage(error, 'Default')

      process.env.NODE_ENV = env
      expect(message).toBe('Detailed error message')
    })

    it('should handle non-Error types', () => {
      const message = getSafeErrorMessage('string error', 'Default')
      expect(message).toBe('Default')
    })
  })

  describe('Error details extraction', () => {
    it('should extract Error object details', () => {
      const error = new Error('Test error')
      const details = getErrorDetails(error)

      expect(details.message).toBe('Test error')
      expect(details.name).toBe('Error')
      expect(details.stack).toBeDefined()
    })

    it('should extract string error', () => {
      const details = getErrorDetails('String error')
      expect(details.message).toBe('String error')
    })

    it('should handle unknown error type', () => {
      const details = getErrorDetails({ custom: 'error' })
      expect(details.message).toBe('Unknown error')
    })
  })

  describe('Error logging', () => {
    it('should format error log with context', () => {
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
      expect(log.error).toBeDefined()
    })

    it('should include timestamp in log', () => {
      const log = formatErrorLog('Error', new Error(), { requestId: 'req-1' })
      expect(log.timestamp).toBeDefined()
      expect(typeof log.timestamp).toBe('string')
    })
  })

  describe('Response creation', () => {
    it('should create success response', () => {
      const response = createSuccessResponse({ id: '123', name: 'Test' }, 'req-1')

      expect(response.success).toBe(true)
      expect(response.data).toEqual({ id: '123', name: 'Test' })
      expect(response.requestId).toBe('req-1')
      expect(response.timestamp).toBeDefined()
    })

    it('should create success response with undefined data', () => {
      const response = createSuccessResponse(undefined, 'req-1')

      expect(response.success).toBe(true)
      expect(response.data).toBeUndefined()
    })

    it('should create error response', async () => {
      const nextResponse = createErrorResponse(
        'Not found',
        ERROR_CODES.RESOURCE_NOT_FOUND,
        'req-1',
        404
      )

      expect(nextResponse.status).toBe(404)

      const data = await nextResponse.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Not found')
      expect(data.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND)
    })

    it('should include details in error response', async () => {
      const nextResponse = createErrorResponse(
        'Validation error',
        ERROR_CODES.VALIDATION_ERROR,
        'req-1',
        400,
        { field: 'email', reason: 'Invalid format' }
      )

      const data = await nextResponse.json()
      expect(data.details).toEqual({ field: 'email', reason: 'Invalid format' })
    })
  })

  describe('Route error handling', () => {
    it('should handle SyntaxError correctly', () => {
      const error = new SyntaxError('Invalid JSON')
      const { response, statusCode } = handleRouteError(error, 'req-1', {
        method: 'POST',
        path: '/api/test',
      })

      expect(statusCode).toBe(400)
      expect(response.status).toBe(400)
    })

    it('should handle validation errors', () => {
      const error = new Error('Validation failed: email is invalid')
      const { response, statusCode } = handleRouteError(error, 'req-1', {
        method: 'POST',
        path: '/api/test',
      })

      expect(statusCode).toBe(400)
    })

    it('should handle not found errors', () => {
      const error = new Error('Resource not found')
      const { response, statusCode } = handleRouteError(error, 'req-1', {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(404)
    })

    it('should handle permission errors', () => {
      const error = new Error('EACCES: permission denied')
      const { response, statusCode } = handleRouteError(error, 'req-1', {
        method: 'DELETE',
        path: '/api/test',
      })

      expect(statusCode).toBe(403)
    })

    it('should handle timeout errors', () => {
      const error = new Error('Request timeout')
      const { response, statusCode } = handleRouteError(error, 'req-1', {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(503)
    })

    it('should default to 500 for unknown errors', () => {
      const error = new Error('Unknown error')
      const { response, statusCode } = handleRouteError(error, 'req-1', {
        method: 'GET',
        path: '/api/test',
      })

      expect(statusCode).toBe(500)
    })
  })

  describe('Correlation ID handling', () => {
    it('should extract existing correlation ID', () => {
      const headers = new Headers()
      headers.set('x-correlation-id', 'existing-id-123')

      const id = extractCorrelationFromRequest(headers)
      expect(id).toBe('existing-id-123')
    })

    it('should fallback to x-request-id', () => {
      const headers = new Headers()
      headers.set('x-request-id', 'request-id-456')

      const id = extractCorrelationFromRequest(headers)
      expect(id).toBe('request-id-456')
    })

    it('should generate new ID if neither header present', () => {
      const headers = new Headers()

      const id = extractCorrelationFromRequest(headers)
      expect(id).toBeDefined()
      expect(id.length).toBeGreaterThan(0)
      expect(id).toMatch(/^\d+-[a-f0-9]+$/)
    })

    it('should prioritize x-correlation-id over x-request-id', () => {
      const headers = new Headers()
      headers.set('x-correlation-id', 'correlation-123')
      headers.set('x-request-id', 'request-456')

      const id = extractCorrelationFromRequest(headers)
      expect(id).toBe('correlation-123')
    })
  })

  describe('Complex error scenarios', () => {
    it('should handle nested retry with circuit breaker', async () => {
      const breaker = new CircuitBreaker(2, 1, 100)
      let attempts = 0

      const operation = async () => {
        attempts++
        if (attempts < 3) throw new Error('timeout')
        return 'success'
      }

      const result = await breaker.execute(async () => {
        return retryWithBackoff(operation, {
          ...DEFAULT_RETRY_CONFIG,
          maxRetries: 2,
        })
      })

      expect(result).toBe('success')
    })

    it('should handle timeout with retry', async () => {
      let attempts = 0

      const slowOperation = async () => {
        attempts++
        if (attempts === 1) {
          await new Promise(() => {}) // Never resolves
        }
        return 'recovered'
      }

      const result = await retryWithBackoff(
        async () => {
          return withTimeout(slowOperation(), 100)
        },
        {
          ...DEFAULT_RETRY_CONFIG,
          maxRetries: 1,
          isRetryable: () => true,
        }
      )

      expect(result).toBe('recovered')
    })

    it('should sanitize error details before logging', () => {
      const unsafeError = new Error('Database error')
      const context = {
        requestId: 'req-1',
        password: 'secret',
        apiKey: 'key123',
        userId: 'user-1',
      }

      const sanitized = sanitizeErrorDetails(context)

      expect(sanitized?.password).toBeUndefined()
      expect(sanitized?.apiKey).toBeUndefined()
      expect(sanitized?.userId).toBe('user-1')
    })
  })
})

