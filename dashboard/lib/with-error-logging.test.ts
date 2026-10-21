import { NextRequest, NextResponse } from 'next/server'
import { withErrorLogging, logErrors } from './with-error-logging'

describe('Error Logging Wrapper', () => {
  const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation()
  const mockConsoleError = jest.spyOn(console, 'error').mockImplementation()

  beforeEach(() => {
    mockConsoleLog.mockClear()
    mockConsoleError.mockClear()
  })

  afterAll(() => {
    mockConsoleLog.mockRestore()
    mockConsoleError.mockRestore()
  })

  describe('withErrorLogging wrapper', () => {
    it('logs successful requests with context', async () => {
      const handler = async (request: NextRequest) => {
        return NextResponse.json({ success: true, data: 'ok' })
      }

      const wrapped = withErrorLogging(handler, { serviceName: 'test-service' })
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET'
      })

      const response = await wrapped(request)

      expect(response.status).toBe(200)
      expect(mockConsoleLog).toHaveBeenCalled()

      // Check that correlation ID is in response
      const correlationId = response.headers.get('x-correlation-id')
      expect(correlationId).toBeTruthy()
    })

    it('logs error requests with full context', async () => {
      const testError = new Error('Test error message')
      const handler = async (request: NextRequest) => {
        throw testError
      }

      const wrapped = withErrorLogging(handler, { serviceName: 'error-service' })
      const request = new NextRequest('http://localhost:3000/api/error', {
        method: 'POST'
      })

      const response = await wrapped(request)

      expect(response.status).toBe(500)
      expect(mockConsoleError).toHaveBeenCalled()

      // Verify error response contains correlation ID
      const body = await response.json()
      expect(body.correlationId).toBeTruthy()
      expect(body.success).toBe(false)
    })

    it('includes request context in error logs', async () => {
      const handler = async (request: NextRequest) => {
        throw new Error('Request context error')
      }

      const wrapped = withErrorLogging(handler, { serviceName: 'context-test' })
      const request = new NextRequest('http://localhost:3000/api/users/123', {
        method: 'PUT',
        headers: {
          'user-agent': 'TestAgent/1.0',
          'x-forwarded-for': '192.168.1.1'
        }
      })

      await wrapped(request)

      expect(mockConsoleError).toHaveBeenCalled()
      const logCall = mockConsoleError.mock.calls[0][0]
      const logOutput = JSON.parse(logCall)

      // Verify context is included
      expect(logOutput.context).toBeDefined()
      expect(logOutput.context.method).toBe('PUT')
      expect(logOutput.context.path).toBe('/api/users/123')
      expect(logOutput.context.ipAddress).toBe('192.168.1.1')
      expect(logOutput.context.duration).toBeGreaterThanOrEqual(0)
    })

    it('includes error details with stack trace when enabled', async () => {
      const testError = new Error('Stack trace error')
      const handler = async (request: NextRequest) => {
        throw testError
      }

      const wrapped = withErrorLogging(handler, {
        serviceName: 'stack-trace-test',
        logStackTrace: true
      })
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET'
      })

      await wrapped(request)

      expect(mockConsoleError).toHaveBeenCalled()
      const logCall = mockConsoleError.mock.calls[0][0]
      const logOutput = JSON.parse(logCall)

      expect(logOutput.error).toBeDefined()
      expect(logOutput.error.name).toBe('Error')
      expect(logOutput.error.message).toBe('Stack trace error')
      expect(logOutput.error.stack).toBeTruthy()
    })

    it('excludes stack trace when disabled', async () => {
      const handler = async (request: NextRequest) => {
        throw new Error('No stack trace error')
      }

      const wrapped = withErrorLogging(handler, {
        serviceName: 'no-stack-test',
        logStackTrace: false
      })
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET'
      })

      await wrapped(request)

      expect(mockConsoleError).toHaveBeenCalled()
      const logCall = mockConsoleError.mock.calls[0][0]
      const logOutput = JSON.parse(logCall)

      // Stack trace should not be in the meta object
      expect(logOutput.meta?.stackTrace).toBeUndefined()
    })

    it('logs 4xx errors with warn level', async () => {
      const handler = async (request: NextRequest) => {
        return NextResponse.json({ error: 'Bad request' }, { status: 400 })
      }

      const wrapped = withErrorLogging(handler, { serviceName: 'warn-test' })
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET'
      })

      await wrapped(request)

      expect(mockConsoleLog).toHaveBeenCalled()
      const logCall = mockConsoleLog.mock.calls[0][0]
      expect(logCall).toContain('[WARN]')
    })

    it('preserves correlation ID across request/response', async () => {
      let capturedCorrelationId: string | undefined

      const handler = async (request: NextRequest) => {
        // Extract correlation ID from request headers
        capturedCorrelationId = request.headers.get('x-correlation-id') || undefined
        return NextResponse.json({ success: true })
      }

      const wrapped = withErrorLogging(handler, { serviceName: 'correlation-test' })
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET'
      })

      const response = await wrapped(request)
      const responseCorrelationId = response.headers.get('x-correlation-id')

      // Both should have correlation ID
      expect(capturedCorrelationId).toBeTruthy()
      expect(responseCorrelationId).toBeTruthy()
    })

    it('measures request duration', async () => {
      const handler = async (request: NextRequest) => {
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 50))
        return NextResponse.json({ success: true })
      }

      const wrapped = withErrorLogging(handler, { serviceName: 'duration-test' })
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET'
      })

      await wrapped(request)

      expect(mockConsoleLog).toHaveBeenCalled()
      const logCall = mockConsoleLog.mock.calls[mockConsoleLog.mock.calls.length - 1][0]
      const logOutput = JSON.parse(logCall)

      expect(logOutput.context.duration).toBeGreaterThanOrEqual(50)
    })
  })

  describe('logErrors utility', () => {
    it('logs successful operations', async () => {
      const result = await logErrors('test-operation', async () => {
        return { data: 'success' }
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ data: 'success' })
      expect(mockConsoleLog).toHaveBeenCalled()
    })

    it('logs failed operations with error context', async () => {
      const testError = new Error('Operation failed')
      const result = await logErrors(
        'failing-operation',
        async () => {
          throw testError
        },
        { userId: 'user-123' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Operation failed')
      expect(mockConsoleError).toHaveBeenCalled()

      const logCall = mockConsoleError.mock.calls[0][0]
      const logOutput = JSON.parse(logCall)
      expect(logOutput.context.userId).toBe('user-123')
      expect(logOutput.context.operation).toBe('failing-operation')
    })

    it('includes custom context in logs', async () => {
      const customContext = {
        userId: 'user-456',
        action: 'create-item'
      }

      await logErrors(
        'custom-operation',
        async () => {
          throw new Error('Custom error')
        },
        customContext
      )

      expect(mockConsoleError).toHaveBeenCalled()
      const logCall = mockConsoleError.mock.calls[0][0]
      const logOutput = JSON.parse(logCall)

      expect(logOutput.context.userId).toBe('user-456')
      expect(logOutput.context.action).toBe('create-item')
    })

    it('measures operation duration', async () => {
      const result = await logErrors(
        'timed-operation',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 50))
          return 'done'
        }
      )

      expect(result.success).toBe(true)
      expect(mockConsoleLog).toHaveBeenCalled()

      const logCall = mockConsoleLog.mock.calls[0][0]
      const logOutput = JSON.parse(logCall)
      expect(logOutput.context.duration).toBeGreaterThanOrEqual(50)
    })
  })

  describe('Error handling edge cases', () => {
    it('handles non-Error exception objects', async () => {
      const handler = async (request: NextRequest) => {
        throw { custom: 'error object' } // Not an Error instance
      }

      const wrapped = withErrorLogging(handler, { serviceName: 'edge-case' })
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET'
      })

      const response = await wrapped(request)

      expect(response.status).toBe(500)
      expect(mockConsoleError).toHaveBeenCalled()
    })

    it('handles string errors', async () => {
      const handler = async (request: NextRequest) => {
        throw 'String error message'
      }

      const wrapped = withErrorLogging(handler, { serviceName: 'string-error' })
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET'
      })

      const response = await wrapped(request)

      expect(response.status).toBe(500)
      expect(mockConsoleError).toHaveBeenCalled()

      const body = await response.json()
      expect(body.success).toBe(false)
    })

    it('handles errors with custom error codes', async () => {
      const error = new Error('Database error')
      ;(error as any).code = 'ECONNREFUSED'

      const handler = async (request: NextRequest) => {
        throw error
      }

      const wrapped = withErrorLogging(handler, { serviceName: 'db-error' })
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET'
      })

      await wrapped(request)

      expect(mockConsoleError).toHaveBeenCalled()
      const logCall = mockConsoleError.mock.calls[0][0]
      const logOutput = JSON.parse(logCall)
      expect(logOutput.meta.errorCode).toBe('ECONNREFUSED')
    })
  })
})
