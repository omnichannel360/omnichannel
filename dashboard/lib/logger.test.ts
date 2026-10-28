import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { logger, createLogContext, getErrorMessage, LogContext } from '@/lib/logger'

// Mock console methods
const consoleSpy = {
  log: jest.spyOn(console, 'log').mockImplementation(() => {}),
  warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
  error: jest.spyOn(console, 'error').mockImplementation(() => {})
}

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    logger.setMinLevel('debug')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('debug()', () => {
    it('logs debug messages with context', () => {
      const context: LogContext = { operation: 'test-op' }

      logger.debug('Debug message', context)

      expect(consoleSpy.log).toHaveBeenCalledTimes(1)
      const output = JSON.parse(consoleSpy.log.mock.calls[0][0])
      expect(output.level).toBe('debug')
      expect(output.message).toBe('Debug message')
      expect(output.context.operation).toBe('test-op')
    })

    it('respects minimum log level', () => {
      logger.setMinLevel('info')

      logger.debug('This should not log', { operation: 'test' })

      expect(consoleSpy.log).not.toHaveBeenCalled()
    })
  })

  describe('info()', () => {
    it('logs info messages', () => {
      logger.info('Info message', { operation: 'test' })

      expect(consoleSpy.log).toHaveBeenCalledTimes(1)
      const output = JSON.parse(consoleSpy.log.mock.calls[0][0])
      expect(output.level).toBe('info')
      expect(output.message).toBe('Info message')
    })
  })

  describe('warn()', () => {
    it('logs warnings', () => {
      logger.warn('Warning message', { operation: 'test' })

      expect(consoleSpy.warn).toHaveBeenCalledTimes(1)
      const output = JSON.parse(consoleSpy.warn.mock.calls[0][0])
      expect(output.level).toBe('warn')
      expect(output.message).toBe('Warning message')
    })
  })

  describe('error()', () => {
    it('logs errors with Error instances', () => {
      const error = new Error('Test error')
      const context: LogContext = { operation: 'test-op' }

      logger.error('Operation failed', error, context)

      expect(consoleSpy.error).toHaveBeenCalledTimes(1)
      const output = JSON.parse(consoleSpy.error.mock.calls[0][0])
      expect(output.level).toBe('error')
      expect(output.message).toBe('Operation failed')
      expect(output.error.name).toBe('Error')
      expect(output.error.message).toBe('Test error')
      expect(output.error.stack).toBeDefined()
    })

    it('logs errors with string errors', () => {
      logger.error('Operation failed', 'String error message', { operation: 'test' })

      expect(consoleSpy.error).toHaveBeenCalledTimes(1)
      const output = JSON.parse(consoleSpy.error.mock.calls[0][0])
      expect(output.error.message).toBe('String error message')
    })

    it('logs errors with unknown types', () => {
      logger.error('Operation failed', { custom: 'error' }, { operation: 'test' })

      expect(consoleSpy.error).toHaveBeenCalledTimes(1)
      const output = JSON.parse(consoleSpy.error.mock.calls[0][0])
      expect(output.error.name).toBe('UnknownError')
    })

    it('sanitizes sensitive fields from context', () => {
      const context: LogContext = {
        operation: 'test',
        password: 'secret123',
        apiKey: 'sk-1234567890'
      }

      logger.error('Operation failed', new Error('Test'), context)

      expect(consoleSpy.error).toHaveBeenCalledTimes(1)
      const output = JSON.parse(consoleSpy.error.mock.calls[0][0])
      expect(output.context.password).toBe('[REDACTED]')
      expect(output.context.apiKey).toBe('[REDACTED]')
      expect(output.context.operation).toBe('test')
    })
  })

  describe('logOperation()', () => {
    it('logs successful operations', () => {
      const context: LogContext = { operation: 'test-op' }

      logger.logOperation('test-op', 150, true, context)

      expect(consoleSpy.log).toHaveBeenCalledTimes(1)
      const output = JSON.parse(consoleSpy.log.mock.calls[0][0])
      expect(output.level).toBe('info')
      expect(output.message).toContain('completed')
      expect(output.context.duration).toBe(150)
      expect(output.context.success).toBe(true)
    })

    it('logs failed operations as warnings', () => {
      const context: LogContext = { operation: 'test-op' }

      logger.logOperation('test-op', 500, false, context)

      expect(consoleSpy.warn).toHaveBeenCalledTimes(1)
      const output = JSON.parse(consoleSpy.warn.mock.calls[0][0])
      expect(output.level).toBe('warn')
      expect(output.message).toContain('failed')
      expect(output.context.success).toBe(false)
    })
  })

  describe('createLogContext()', () => {
    it('creates context with default values', () => {
      const context = createLogContext()

      expect(context.correlationId).toBeDefined()
      expect(context.timestamp).toBeDefined()
      expect(typeof context.correlationId).toBe('string')
    })

    it('merges overrides with defaults', () => {
      const context = createLogContext({
        operation: 'custom-op',
        userId: 'user-123'
      })

      expect(context.correlationId).toBeDefined()
      expect(context.operation).toBe('custom-op')
      expect(context.userId).toBe('user-123')
    })
  })

  describe('getErrorMessage()', () => {
    it('extracts message from Error instances', () => {
      const error = new Error('Test error message')
      expect(getErrorMessage(error)).toBe('Test error message')
    })

    it('returns string errors as-is', () => {
      expect(getErrorMessage('String error')).toBe('String error')
    })

    it('returns generic fallback for unknown error types (does not serialize arbitrary objects)', () => {
      const result = getErrorMessage({ code: 'ERR001' })
      expect(typeof result).toBe('string')
      expect(result).toBe('An unexpected error occurred')
    })

    it('returns fallback for undefined/null', () => {
      expect(getErrorMessage(undefined)).toBe('An unexpected error occurred')
      expect(getErrorMessage(null)).toBe('An unexpected error occurred')
    })
  })

  describe('Request context logging', () => {
    it('includes request metadata in context', () => {
      const context: LogContext = {
        method: 'POST',
        route: '/api/users',
        statusCode: 400
      }

      logger.error('API error', new Error('Invalid request'), context)

      expect(consoleSpy.error).toHaveBeenCalledTimes(1)
      const output = JSON.parse(consoleSpy.error.mock.calls[0][0])
      expect(output.context.method).toBe('POST')
      expect(output.context.route).toBe('/api/users')
      expect(output.context.statusCode).toBe(400)
    })
  })

  describe('Log Entry Structure', () => {
    it('includes timestamp in ISO format', () => {
      logger.info('Test message')

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0])
      expect(output.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('preserves metadata', () => {
      const meta = { requestId: 'req-123', userId: 'user-456' }

      logger.info('Test message', undefined, meta)

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0])
      expect(output.meta).toEqual(meta)
    })
  })

  describe('Error Sanitization', () => {
    it('sanitizes all sensitive field variations', () => {
      const context: LogContext = {
        password: 'secret',
        token: 'token-secret',
        accessToken: 'access-secret',
        refreshToken: 'refresh-secret',
        apiKey: 'key-secret',
        secret: 'secret-secret',
        Authorization: 'Bearer token',
        authorization: 'bearer token',
        sessionId: 'session-secret',
        creditCard: '4111-1111-1111-1111',
        ssn: '123-45-6789'
      }

      logger.info('Test', context)

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0])
      Object.values(output.context).forEach(value => {
        expect(value).not.toMatch(/secret|token|key|Bearer|4111|123-45/)
      })
    })
  })
})


describe('Edge runtime safety', () => {
  // middleware.ts imports the logger and runs in the Edge runtime, where Node built-ins are unavailable
  it('does not import the Node crypto module', () => {
    const fs = jest.requireActual<typeof import('fs')>('fs')
    const path = jest.requireActual<typeof import('path')>('path')
    const source = fs.readFileSync(path.join(__dirname, 'logger.ts'), 'utf-8')

    expect(source).not.toMatch(/from ['"](node:)?crypto['"]/)
    expect(source).not.toMatch(/require\(['"](node:)?crypto['"]\)/)
  })

  it('generates a UUID v4 correlation id with Web Crypto', () => {
    const { correlationId } = createLogContext()

    expect(correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
