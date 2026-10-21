import { NextRequest } from 'next/server'
import { parseRequestJson, jsonParseErrorResponse } from '@/lib/json-utils'

// Mock NextRequest with custom json() behavior
function createMockRequest(body: string, contentType?: string): NextRequest {
  const init: RequestInit = {
    method: 'POST',
    body: body,
    headers: contentType
      ? { 'content-type': contentType }
      : { 'content-type': 'application/json' },
  }
  const request = new NextRequest('http://localhost/api/test', init)
  return request
}

describe('parseRequestJson', () => {
  describe('valid JSON', () => {
    test('parses valid JSON object', async () => {
      const request = createMockRequest('{"key": "value"}')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(true)
      expect(result.body).toEqual({ key: 'value' })
      expect(result.error).toBeUndefined()
    })

    test('parses valid JSON array', async () => {
      const request = createMockRequest('[1, 2, 3]')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(true)
      expect(result.body).toEqual([1, 2, 3])
    })

    test('parses valid JSON with nested objects', async () => {
      const request = createMockRequest('{"user": {"name": "John", "age": 30}}')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(true)
      expect(result.body).toEqual({
        user: { name: 'John', age: 30 },
      })
    })

    test('parses JSON with special characters', async () => {
      const request = createMockRequest('{"message": "Hello\\nWorld"}')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(true)
      expect(result.body).toEqual({ message: 'Hello\nWorld' })
    })
  })

  describe('invalid JSON', () => {
    test('fails on invalid JSON syntax', async () => {
      const request = createMockRequest('{invalid json}')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid JSON syntax in request body')
      expect(result.body).toBeUndefined()
    })

    test('fails on incomplete JSON', async () => {
      const request = createMockRequest('{"key": "value"')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Invalid JSON|incomplete|malformed/)
    })

    test('fails on null body', async () => {
      const request = createMockRequest('null')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Request body cannot be null')
    })

    test('fails on empty body', async () => {
      const request = createMockRequest('')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(false)
    })

    test('fails on trailing commas', async () => {
      const request = createMockRequest('{"key": "value",}')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Invalid JSON|Failed to parse/)
    })
  })

  describe('content-type validation', () => {
    test('fails on non-JSON content-type', async () => {
      const request = createMockRequest('{"key": "value"}', 'text/plain')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Content-Type must be application/json')
    })

    test('fails on form-encoded content-type', async () => {
      const request = createMockRequest('key=value', 'application/x-www-form-urlencoded')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Content-Type must be application/json')
    })

    test('allows charset in content-type', async () => {
      const request = createMockRequest('{"key": "value"}', 'application/json; charset=utf-8')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(true)
      expect(result.body).toEqual({ key: 'value' })
    })
  })

  describe('edge cases', () => {
    test('parses JSON boolean', async () => {
      const request = createMockRequest('true')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(true)
      expect(result.body).toBe(true)
    })

    test('parses JSON number', async () => {
      const request = createMockRequest('42')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(true)
      expect(result.body).toBe(42)
    })

    test('parses JSON string', async () => {
      const request = createMockRequest('"hello"')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(true)
      expect(result.body).toBe('hello')
    })

    test('parses empty object', async () => {
      const request = createMockRequest('{}')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(true)
      expect(result.body).toEqual({})
    })

    test('parses empty array', async () => {
      const request = createMockRequest('[]')
      const result = await parseRequestJson(request)

      expect(result.success).toBe(true)
      expect(result.body).toEqual([])
    })
  })
})

describe('jsonParseErrorResponse', () => {
  test('returns 400 status', async () => {
    const response = jsonParseErrorResponse('Invalid JSON')

    expect(response.status).toBe(400)
  })

  test('returns error in response body', async () => {
    const response = jsonParseErrorResponse('Custom error message')
    const body = await response.json()

    expect(body.success).toBe(false)
    expect(body.error).toBe('Custom error message')
  })

  test('never leaks internal error details', async () => {
    const errorWithStackTrace = 'SyntaxError: Unexpected token < at line 5 col 10'
    const response = jsonParseErrorResponse(errorWithStackTrace)
    const body = await response.json()

    expect(body.error).toBe(errorWithStackTrace)
    expect(body).not.toHaveProperty('stack')
    expect(body).not.toHaveProperty('trace')
  })
})
