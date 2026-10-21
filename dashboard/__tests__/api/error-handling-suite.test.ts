/**
 * Comprehensive Error Handling Test Suite
 * Validates structured error responses across all API endpoints
 */

import {
  createErrorResponse,
  createSuccessResponse,
  handleRouteError,
  ERROR_CODES,
  getOrCreateCorrelationId,
  getSafeErrorMessage,
  getErrorDetails,
  formatErrorLog,
  getHttpStatus,
} from '@/lib/error-handling'

describe('Error Handling Core Functions', () => {
  describe('Correlation ID Management', () => {
    it('should create unique correlation IDs', () => {
      const id1 = getOrCreateCorrelationId()
      const id2 = getOrCreateCorrelationId()
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^\d+-[a-f0-9]+$/)
    })

    it('should preserve existing correlation IDs', () => {
      const existingId = 'test-id-123'
      const result = getOrCreateCorrelationId(existingId)
      expect(result).toBe(existingId)
    })

    it('should generate new ID for null or empty string', () => {
      expect(getOrCreateCorrelationId(null)).toMatch(/^\d+-[a-f0-9]+$/)
      expect(getOrCreateCorrelationId('')).toMatch(/^\d+-[a-f0-9]+$/)
    })
  })

  describe('Safe Error Messages', () => {
    const originalEnv = process.env.NODE_ENV

    afterEach(() => {
      process.env.NODE_ENV = originalEnv
    })

    it('should return full message in development', () => {
      process.env.NODE_ENV = 'development'
      const error = new Error('Database connection failed')
      const safe = getSafeErrorMessage(error, 'Default')
      expect(safe).toBe('Database connection failed')
    })

    it('should return default message in production for internal errors', () => {
      process.env.NODE_ENV = 'production'
      const error = new Error('Internal server error at 192.168.1.1:5432')
      const safe = getSafeErrorMessage(error, 'Something went wrong')
      expect(safe).toBe('Something went wrong')
    })

    it('should expose validation errors in production', () => {
      process.env.NODE_ENV = 'production'
      const error = new Error('validation: Email format is invalid')
      const safe = getSafeErrorMessage(error, 'Default')
      expect(safe).toContain('validation')
    })
  })

  describe('Error Details Extraction', () => {
    it('should extract Error object properties', () => {
      const error = new Error('Test message')
      const details = getErrorDetails(error)
      expect(details.message).toBe('Test message')
      expect(details.stack).toBeDefined()
      expect(details.name).toBe('Error')
    })

    it('should handle string errors', () => {
      const details = getErrorDetails('String error')
      expect(details.message).toBe('String error')
    })

    it('should handle unknown types', () => {
      const details = getErrorDetails(null)
      expect(details.message).toBe('Unknown error')
    })
  })

  describe('HTTP Status Code Mapping', () => {
    const statusMappings = [
      [ERROR_CODES.AUTH_MISSING, 401],
      [ERROR_CODES.AUTH_INVALID, 401],
      [ERROR_CODES.AUTH_EXPIRED, 401],
      [ERROR_CODES.INSUFFICIENT_PERMISSIONS, 403],
      [ERROR_CODES.VALIDATION_ERROR, 400],
      [ERROR_CODES.INVALID_INPUT, 400],
      [ERROR_CODES.RATE_LIMIT_EXCEEDED, 429],
      [ERROR_CODES.INTERNAL_ERROR, 500],
      [ERROR_CODES.SERVICE_UNAVAILABLE, 503],
      [ERROR_CODES.NOT_FOUND, 404],
      [ERROR_CODES.RESOURCE_NOT_FOUND, 404],
      [ERROR_CODES.CONFLICT, 409],
    ]

    statusMappings.forEach(([code, expectedStatus]) => {
      it(`should map ${code} to HTTP ${expectedStatus}`, () => {
        expect(getHttpStatus(code as any)).toBe(expectedStatus)
      })
    })
  })

  describe('Success Response Formatting', () => {
    it('should include success flag and timestamp', () => {
      const result = createSuccessResponse({ id: '123' }, 'req-id')
      expect(result.success).toBe(true)
      expect(result.requestId).toBe('req-id')
      expect(result.timestamp).toBeDefined()
      expect(new Date(result.timestamp)).toBeInstanceOf(Date)
    })

    it('should omit undefined data', () => {
      const result = createSuccessResponse(undefined, 'req-id')
      expect(result.success).toBe(true)
      expect('data' in result).toBe(false)
    })
  })

  describe('Error Logging Context', () => {
    it('should format error logs with full context', () => {
      const error = new Error('Test')
      const context = {
        requestId: 'req-123',
        method: 'POST',
        path: '/api/test',
        statusCode: 500,
      }
      const log = formatErrorLog('Operation failed', error, context)
      expect(log.message).toBe('Operation failed')
      expect(log.requestId).toBe('req-123')
      expect(log.method).toBe('POST')
      expect(log.error).toBeDefined()
    })
  })

  describe('Route Error Handler', () => {
    it('should handle SyntaxError as 400', () => {
      const error = new SyntaxError('Invalid JSON')
      const { statusCode } = handleRouteError(error, 'req-123', {
        method: 'POST',
        path: '/api/test',
      })
      expect(statusCode).toBe(400)
    })

    it('should handle validation errors as 400', () => {
      const error = new Error('validation: Field is required')
      const { statusCode } = handleRouteError(error, 'req-123', {
        method: 'POST',
        path: '/api/test',
      })
      expect(statusCode).toBe(400)
    })

    it('should handle ENOENT as 404', () => {
      const error = new Error('ENOENT: file not found')
      const { statusCode } = handleRouteError(error, 'req-123', {
        method: 'GET',
        path: '/api/test',
      })
      expect(statusCode).toBe(404)
    })

    it('should handle timeout as 503', () => {
      const error = new Error('Request timeout after 30000ms')
      const { statusCode } = handleRouteError(error, 'req-123', {
        method: 'GET',
        path: '/api/test',
      })
      expect(statusCode).toBe(503)
    })

    it('should default to 500 for unknown errors', () => {
      const error = new Error('Unknown error')
      const { statusCode } = handleRouteError(error, 'req-123', {
        method: 'POST',
        path: '/api/test',
      })
      expect(statusCode).toBe(500)
    })
  })
})
