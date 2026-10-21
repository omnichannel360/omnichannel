/**
 * Error Logging Integration Tests
 * Tests error logging across API routes with context, correlation IDs, and sanitization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from '@jest/globals'
import { NextRequest } from 'next/server'
import { createLogContext, logger } from '@/lib/logger'
import type { LogContext } from '@/lib/logger'

// Mock console methods
const consoleMocks = {
  error: jest.spyOn(console, 'error').mockImplementation(() => {}),
  warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
  log: jest.spyOn(console, 'log').mockImplementation(() => {})
}

describe('Error Logging in API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    logger.setMinLevel('debug')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Correlation ID Tracking', () => {
    it('generates unique correlation IDs for each request', () => {
      const context1 = createLogContext()
      const context2 = createLogContext()

      expect(context1.correlationId).toBeDefined()
      expect(context2.correlationId).toBeDefined()
      expect(context1.correlationId).not.toBe(context2.correlationId)
    })

    it('includes correlation ID in error logs', () => {
      const correlationId = 'corr-test-123'
      const context: LogContext = { correlationId, operation: 'test-op' }

      logger.error('Operation failed', new Error('Test error'), context)

      expect(consoleMocks.error).toHaveBeenCalledOnce()
      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.context.correlationId).toBe(correlationId)
    })

    it('preserves correlation ID across multiple logs for same request', () => {
      const correlationId = 'corr-flow-123'
      const context: LogContext = { correlationId }

      logger.debug('Starting operation', context)
      logger.info('Processing', { ...context, step: 1 })
      logger.error('Failed', new Error('Error'), { ...context, step: 2 })

      expect(consoleMocks.error).toHaveBeenCalled()
      const allLogs = [...consoleMocks.log.mock.calls, ...consoleMocks.error.mock.calls]
      allLogs.forEach(call => {
        const output = JSON.parse(call[0])
        expect(output.context.correlationId).toBe(correlationId)
      })
    })
  })

  describe('Request Context Logging', () => {
    it('logs HTTP method and path', () => {
      const context: LogContext = { method: 'POST', route: '/api/users' }

      logger.error('API error', new Error('Request failed'), context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.context.method).toBe('POST')
      expect(output.context.route).toBe('/api/users')
    })

    it('logs response status code on error', () => {
      const context: LogContext = { statusCode: 500, operation: 'create_user' }

      logger.error('Operation failed', new Error('Database error'), context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.context.statusCode).toBe(500)
    })

    it('logs response time for operations', () => {
      const context: LogContext = { duration: 245, operation: 'fetch_data' }

      logger.logOperation('fetch_data', 245, false, context)

      const output = JSON.parse(consoleMocks.warn.mock.calls[0][0])
      expect(output.context.duration).toBe(245)
      expect(output.message).toContain('245ms')
    })

    it('logs user information when available', () => {
      const context: LogContext = { userId: 'user-456', userEmail: 'test@example.com' }

      logger.error('Auth error', new Error('Invalid token'), context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.context.userId).toBe('user-456')
      expect(output.context.userEmail).toBe('test@example.com')
    })
  })

  describe('Error Details and Stack Traces', () => {
    it('captures error name and message', () => {
      const error = new TypeError('Cannot read property X of undefined')
      const context: LogContext = { operation: 'process_data' }

      logger.error('Type error occurred', error, context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.error.name).toBe('TypeError')
      expect(output.error.message).toBe('Cannot read property X of undefined')
    })

    it('includes stack trace for debugging', () => {
      const error = new Error('Processing failed')
      const context: LogContext = {}

      logger.error('Operation error', error, context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.error.stack).toBeDefined()
      expect(output.error.stack).toContain('Error: Processing failed')
    })

    it('handles custom error codes', () => {
      const error = new Error('Not found') as unknown
      error.code = 'ENOENT'
      const context: LogContext = { operation: 'read_file' }

      logger.error('File operation failed', error, context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.error.code).toBe('ENOENT')
    })

    it('handles string errors without stack trace', () => {
      const context: LogContext = { operation: 'validate_input' }

      logger.error('Validation failed', 'Invalid email format', context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.error.message).toBe('Invalid email format')
      expect(output.error.stack).toBeUndefined()
    })
  })

  describe('Sensitive Data Sanitization', () => {
    it('redacts passwords in context', () => {
      const context: LogContext = {
        operation: 'login',
        password: 'secret123',
        username: 'user@example.com'
      }

      logger.error('Login failed', new Error('Invalid credentials'), context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.context.password).toBe('[REDACTED]')
      expect(output.context.username).toBe('user@example.com')
    })

    it('redacts tokens and API keys', () => {
      const context: LogContext = {
        token: 'sk-1234567890abcdef',
        apiKey: 'key-secret',
        refreshToken: 'rt-secret'
      }

      logger.error('API error', new Error('Auth failed'), context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.context.token).toBe('[REDACTED]')
      expect(output.context.apiKey).toBe('[REDACTED]')
      expect(output.context.refreshToken).toBe('[REDACTED]')
    })

    it('redacts Authorization headers', () => {
      const context: LogContext = {
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        authorization: 'bearer token123'
      }

      logger.error('Request failed', new Error('Unauthorized'), context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.context.Authorization).toBe('[REDACTED]')
      expect(output.context.authorization).toBe('[REDACTED]')
    })

    it('redacts nested sensitive fields', () => {
      const context: LogContext = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          password: 'secret123',
          sessionId: 'sess-secret'
        }
      } as unknown

      logger.error('User operation failed', new Error('Error'), context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.context.user.password).toBe('[REDACTED]')
      expect(output.context.user.sessionId).toBe('[REDACTED]')
      expect(output.context.user.email).toBe('test@example.com')
    })

    it('preserves non-sensitive data while sanitizing', () => {
      const context: LogContext = {
        operation: 'update_profile',
        userId: 'user-123',
        action: 'profile_update',
        statusCode: 200,
        password: 'secret'
      }

      logger.error('Operation failed', new Error('Error'), context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.context.operation).toBe('update_profile')
      expect(output.context.userId).toBe('user-123')
      expect(output.context.action).toBe('profile_update')
      expect(output.context.statusCode).toBe(200)
      expect(output.context.password).toBe('[REDACTED]')
    })
  })

  describe('Error Classification', () => {
    it('logs validation errors as warnings', () => {
      const context: LogContext = { operation: 'validate', statusCode: 400 }

      logger.warn('Validation error', {
        field: 'email',
        message: 'Invalid email format'
      })

      const output = JSON.parse(consoleMocks.warn.mock.calls[0][0])
      expect(output.level).toBe('warn')
    })

    it('logs not found errors with 404 status', () => {
      const context: LogContext = { operation: 'fetch_user', statusCode: 404 }

      logger.error('Resource not found', new Error('User not found'), context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.context.statusCode).toBe(404)
    })

    it('logs server errors with 500 status', () => {
      const context: LogContext = { operation: 'process_data', statusCode: 500 }

      logger.error('Server error', new Error('Database connection failed'), context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.context.statusCode).toBe(500)
    })

    it('logs unauthorized errors with 401 status', () => {
      const context: LogContext = { operation: 'authenticate', statusCode: 401 }

      logger.warn('Authentication failed', { reason: 'Invalid token' })

      expect(consoleMocks.warn).toHaveBeenCalled()
    })
  })

  describe('Metadata and Additional Context', () => {
    it('includes arbitrary metadata in logs', () => {
      const context: LogContext = { operation: 'batch_process' }
      const meta = { processedCount: 150, failedCount: 5 }

      logger.error('Batch processing failed', new Error('Error'), context, meta)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.meta).toEqual(meta)
    })

    it('logs timestamps in ISO format', () => {
      const context: LogContext = {}

      logger.error('Error occurred', new Error('Test'), context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('includes service name in log output', () => {
      const context: LogContext = {}

      logger.error('Service error', new Error('Error'), context)

      const output = JSON.parse(consoleMocks.error.mock.calls[0][0])
      expect(output.service).toBe('default')
    })
  })

  describe('Log Level Management', () => {
    it('respects debug level minimum', () => {
      logger.setMinLevel('debug')
      const context: LogContext = {}

      logger.debug('Debug message', context)

      expect(consoleMocks.log).toHaveBeenCalled()
    })

    it('filters debug when minimum level is info', () => {
      logger.setMinLevel('info')
      const context: LogContext = {}

      logger.debug('Debug message', context)

      expect(consoleMocks.log).not.toHaveBeenCalled()
    })

    it('filters debug and info when minimum level is warn', () => {
      logger.setMinLevel('warn')
      const context: LogContext = {}

      logger.debug('Debug message', context)
      logger.info('Info message', context)
      logger.warn('Warning', context)

      expect(consoleMocks.log).not.toHaveBeenCalled()
      expect(consoleMocks.warn).toHaveBeenCalled()
    })
  })
})

