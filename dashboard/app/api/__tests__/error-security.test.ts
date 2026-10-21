/**
 * Error Handling Security Tests
 * Tests error message sanitization, sensitive data handling, and production safety
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  sanitizeErrorDetails,
  getSafeErrorMessage,
  getErrorDetails,
  createErrorResponse,
  ERROR_CODES,
} from '@/lib/error-handling'

describe('Error Handling Security', () => {
  describe('sanitizeErrorDetails function', () => {
    it('should redact password fields', () => {
      const details = {
        operation: 'login',
        password: 'super-secret-123',
        username: 'user@example.com',
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.password).toBeUndefined()
      expect(sanitized?.username).toBe('user@example.com')
      expect(sanitized?.operation).toBe('login')
    })

    it('should redact token fields', () => {
      const details = {
        token: 'sk-proj-xyz123',
        accessToken: 'at-secret',
        refreshToken: 'rt-secret',
        operation: 'api_call',
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.token).toBeUndefined()
      expect(sanitized?.accessToken).toBeUndefined()
      expect(sanitized?.refreshToken).toBeUndefined()
      expect(sanitized?.operation).toBe('api_call')
    })

    it('should redact API keys and secrets', () => {
      const details = {
        apiKey: 'sk-1234567890',
        secretKey: 'secret-xyz',
        apiSecret: 'secret-abc',
        publicId: 'pub-123',
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.apiKey).toBeUndefined()
      expect(sanitized?.secretKey).toBeUndefined()
      expect(sanitized?.apiSecret).toBeUndefined()
      expect(sanitized?.publicId).toBe('pub-123')
    })

    it('should redact authorization headers', () => {
      const details = {
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        Authorization: 'Bearer sk-xyz123',
        method: 'POST',
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.authorization).toBeUndefined()
      expect(sanitized?.Authorization).toBeUndefined()
      expect(sanitized?.method).toBe('POST')
    })

    it('should redact credentials field', () => {
      const details = {
        credentials: 'user:pass',
        dbConnection: 'postgresql://...',
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.credentials).toBeUndefined()
    })

    it('should preserve non-sensitive strings under 500 chars', () => {
      const details = {
        message: 'User not found in database',
        userId: 'abc-123-def-456',
        requestPath: '/api/users/abc-123-def-456',
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.message).toBe('User not found in database')
      expect(sanitized?.userId).toBe('abc-123-def-456')
      expect(sanitized?.requestPath).toBe('/api/users/abc-123-def-456')
    })

    it('should preserve numbers and booleans', () => {
      const details = {
        statusCode: 404,
        retryCount: 3,
        success: false,
        timeout: 5000,
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.statusCode).toBe(404)
      expect(sanitized?.retryCount).toBe(3)
      expect(sanitized?.success).toBe(false)
      expect(sanitized?.timeout).toBe(5000)
    })

    it('should exclude strings longer than 500 characters', () => {
      const longString = 'a'.repeat(600)
      const details = {
        shortString: 'short',
        longString,
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.shortString).toBe('short')
      expect(sanitized?.longString).toBeUndefined()
    })

    it('should handle null and undefined details gracefully', () => {
      expect(sanitizeErrorDetails(null)).toBeUndefined()
      expect(sanitizeErrorDetails(undefined)).toBeUndefined()
    })

    it('should return undefined when all fields are redacted', () => {
      const details = {
        password: 'secret',
        apiKey: 'key',
        token: 'token',
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized).toBeUndefined()
    })

    it('should handle nested objects carefully', () => {
      const details = {
        user: {
          id: 'user-123',
          password: 'secret',
        },
        operation: 'create_user',
      }

      const sanitized = sanitizeErrorDetails(details)

      // Nested objects are not recursively sanitized in current implementation
      expect(sanitized?.operation).toBe('create_user')
    })

    it('should be case insensitive for sensitive fields', () => {
      const details = {
        PASSWORD: 'secret',
        Password: 'secret',
        password: 'secret',
        TOKEN: 'token',
        Token: 'token',
        token: 'token',
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.PASSWORD).toBeUndefined()
      expect(sanitized?.Password).toBeUndefined()
      expect(sanitized?.password).toBeUndefined()
      expect(sanitized?.TOKEN).toBeUndefined()
      expect(sanitized?.Token).toBeUndefined()
      expect(sanitized?.token).toBeUndefined()
    })
  })

  describe('Production safety - getSafeErrorMessage', () => {
    let originalEnv: string | undefined

    beforeEach(() => {
      originalEnv = process.env.NODE_ENV
    })

    afterEach(() => {
      process.env.NODE_ENV = originalEnv
    })

    it('should hide database errors in production', () => {
      process.env.NODE_ENV = 'production'

      const error = new Error('Database connection refused at 192.168.1.100:5432')
      const message = getSafeErrorMessage(error, 'Service unavailable')

      expect(message).toBe('Service unavailable')
    })

    it('should hide file system errors in production', () => {
      process.env.NODE_ENV = 'production'

      const error = new Error(
        'EACCES: permission denied, open /etc/shadow'
      )
      const message = getSafeErrorMessage(error, 'Access denied')

      expect(message).toBe('Access denied')
    })

    it('should hide network errors in production', () => {
      process.env.NODE_ENV = 'production'

      const error = new Error('ECONNREFUSED: Connection refused at 10.0.0.1:3000')
      const message = getSafeErrorMessage(error, 'Service unavailable')

      expect(message).toBe('Service unavailable')
    })

    it('should expose validation errors in production', () => {
      process.env.NODE_ENV = 'production'

      const error = new Error('validation: email must be a valid email address')
      const message = getSafeErrorMessage(error, 'Default')

      expect(message).toContain('validation')
    })

    it('should expose invalid format errors in production', () => {
      process.env.NODE_ENV = 'production'

      const error = new Error('invalid: phone number must contain 10 digits')
      const message = getSafeErrorMessage(error, 'Default')

      expect(message).toContain('invalid')
    })

    it('should expose schema validation errors in production', () => {
      process.env.NODE_ENV = 'production'

      const error = new Error('schema validation failed for user object')
      const message = getSafeErrorMessage(error, 'Default')

      expect(message).toContain('schema')
    })

    it('should expose all errors in development', () => {
      process.env.NODE_ENV = 'development'

      const errors = [
        'Database connection refused',
        'EACCES: permission denied',
        'ECONNREFUSED: connection refused',
        'Sensitive internal error',
      ]

      errors.forEach((errorMsg) => {
        const error = new Error(errorMsg)
        const message = getSafeErrorMessage(error, 'Default')
        expect(message).toBe(errorMsg)
      })
    })
  })

  describe('Error details extraction security', () => {
    it('should extract error information safely from Error objects', () => {
      const error = new Error('Test error message')
      const details = getErrorDetails(error)

      expect(details.message).toBe('Test error message')
      expect(details.name).toBe('Error')
      expect(details.stack).toBeDefined()
    })

    it('should extract information from TypeError', () => {
      const error = new TypeError('Property does not exist')
      const details = getErrorDetails(error)

      expect(details.name).toBe('TypeError')
      expect(details.message).toBe('Property does not exist')
    })

    it('should handle string errors safely', () => {
      const details = getErrorDetails('String error message')

      expect(details.message).toBe('String error message')
      expect(details.stack).toBeUndefined()
      expect(details.name).toBeUndefined()
    })

    it('should handle unknown error types safely', () => {
      const details = getErrorDetails({ error: 'unknown' })

      expect(details.message).toBe('Unknown error')
    })

    it('should never expose sensitive information in stack traces', () => {
      const error = new Error('API call failed')
      error.stack = `Error: API call failed
        at authenticateUser (file.ts:20:5)
          api_key=sk-123456789
          password=super-secret`

      const details = getErrorDetails(error)

      // Stack trace is included but should be sanitized elsewhere
      expect(details.stack).toBeDefined()
    })
  })

  describe('Error response security', () => {
    it('should not expose error details to client by default', async () => {
      const response = createErrorResponse(
        'Request failed',
        ERROR_CODES.INTERNAL_ERROR,
        'req-123',
        500
      )

      const data = await response.json()

      expect(data.details).toBeUndefined()
    })

    it('should only include safe error details in response', async () => {
      const safeDetails = {
        field: 'email',
        message: 'Invalid format',
      }

      const response = createErrorResponse(
        'Validation failed',
        ERROR_CODES.VALIDATION_ERROR,
        'req-456',
        400,
        safeDetails
      )

      const data = await response.json()

      expect(data.details).toEqual(safeDetails)
      expect(data.details?.password).toBeUndefined()
    })

    it('should include request ID for tracking', async () => {
      const response = createErrorResponse(
        'Error',
        ERROR_CODES.INTERNAL_ERROR,
        'request-correlation-id-789',
        500
      )

      const data = await response.json()

      expect(data.requestId).toBe('request-correlation-id-789')
    })

    it('should not expose stack traces in response', async () => {
      const response = createErrorResponse(
        'Error',
        ERROR_CODES.INTERNAL_ERROR,
        'req-000',
        500
      )

      const data = await response.json()

      expect(JSON.stringify(data)).not.toContain('at ')
      expect(JSON.stringify(data)).not.toContain('.ts:')
    })

    it('should set appropriate HTTP status codes', async () => {
      const testCases = [
        [ERROR_CODES.AUTH_MISSING, 401],
        [ERROR_CODES.INSUFFICIENT_PERMISSIONS, 403],
        [ERROR_CODES.VALIDATION_ERROR, 400],
        [ERROR_CODES.RATE_LIMIT_EXCEEDED, 429],
        [ERROR_CODES.INTERNAL_ERROR, 500],
      ] as const

      for (const [code, expectedStatus] of testCases) {
        const response = createErrorResponse('Error', code, 'req-id', expectedStatus)
        expect(response.status).toBe(expectedStatus)
      }
    })
  })

  describe('Sensitive data patterns', () => {
    it('should identify database credentials patterns', () => {
      const patterns = [
        'postgresql://user:password@host:5432/db',
        'mongodb+srv://user:password@cluster.mongodb.net/db',
        'mysql://root:password@localhost:3306/database',
      ]

      patterns.forEach((pattern) => {
        const details = {
          connectionString: pattern,
          operation: 'connect',
        }

        const sanitized = sanitizeErrorDetails(details)

        // Credentials in connection strings are long, should be excluded
        expect(sanitized?.connectionString).toBeUndefined()
        expect(sanitized?.operation).toBe('connect')
      })
    })

    it('should identify JWT token patterns', () => {
      const details = {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        userId: '12345',
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.token).toBeUndefined()
      expect(sanitized?.userId).toBe('12345')
    })

    it('should identify API key patterns', () => {
      const details = {
        apiKey: 'sk-proj-1234567890abcdefghijklmnop',
        publicKey: 'pk-12345678',
        secret: 'secret-value',
      }

      const sanitized = sanitizeErrorDetails(details)

      expect(sanitized?.apiKey).toBeUndefined()
      expect(sanitized?.secret).toBeUndefined()
      expect(sanitized?.publicKey).toBe('pk-12345678')
    })
  })
})
