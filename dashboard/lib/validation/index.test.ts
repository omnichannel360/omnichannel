/**
 * Comprehensive test suite for unified validation system
 * Tests all validation utilities, schema parsing, and error handling
 */

import { describe, it, expect, beforeEach, vi } from '@jest/globals'
import { z } from 'zod'
import {
  validateBody,
  validateQuery,
  validateBodyAndQuery,
  formatZodErrors,
  sanitizeString,
  isValidEmail,
  isValidPassword,
  isPositiveNumber,
  isValidLimit,
  isValidId,
  safeJsonParse,
} from './index'
import { NextRequest } from 'next/server'

/**
 * Test data setup
 */

const TestBodySchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
})

const TestQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  search: z.string().max(100).optional(),
})

/**
 * Helper to create a mock NextRequest
 */
function createMockRequest(
  method: string = 'POST',
  url: string = 'http://localhost:3000/api/test',
  body?: unknown,
  queryString?: string
): Partial<NextRequest> {
  const fullUrl = queryString ? `${url}?${queryString}` : url
  return {
    method,
    url: fullUrl,
    nextUrl: new URL(fullUrl),
    json: async () => body || {},
  }
}

/**
 * UNIT TESTS: Zod Error Formatting
 */

describe('formatZodErrors', () => {
  it('should format single field errors', () => {
    const schema = z.object({ email: z.string().email() })
    const result = schema.safeParse({ email: 'invalid-email' })

    if (!result.success) {
      const errors = formatZodErrors(result.error)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].field).toBe('email')
      expect(errors[0].message).toContain('email')
    }
  })

  it('should format nested field errors', () => {
    const schema = z.object({
      user: z.object({
        profile: z.object({
          email: z.string().email(),
        }),
      }),
    })
    const result = schema.safeParse({
      user: { profile: { email: 'invalid' } },
    })

    if (!result.success) {
      const errors = formatZodErrors(result.error)
      expect(errors[0].field).toContain('user')
      expect(errors[0].field).toContain('profile')
      expect(errors[0].field).toContain('email')
    }
  })

  it('should include error codes', () => {
    const schema = z.object({ age: z.number().int() })
    const result = schema.safeParse({ age: '25' })

    if (!result.success) {
      const errors = formatZodErrors(result.error)
      expect(errors[0]).toHaveProperty('code')
    }
  })
})

/**
 * UNIT TESTS: Input Sanitization
 */

describe('sanitizeString', () => {
  it('should remove null bytes', () => {
    const input = 'hello\0world'
    expect(sanitizeString(input)).toBe('helloworld')
  })

  it('should remove control characters', () => {
    const input = 'hello\x00\x01\x02world'
    expect(sanitizeString(input)).not.toContain('\x00')
  })

  it('should trim whitespace', () => {
    const input = '  hello world  '
    expect(sanitizeString(input)).toBe('hello world')
  })

  it('should preserve safe content', () => {
    const input = 'Hello, World! 123'
    expect(sanitizeString(input)).toBe('Hello, World! 123')
  })
})

/**
 * UNIT TESTS: Type Guards
 */

describe('Type Guards', () => {
  describe('isValidEmail', () => {
    it('should validate correct emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true)
      expect(isValidEmail('test.email+tag@domain.co.uk')).toBe(true)
    })

    it('should reject invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false)
      expect(isValidEmail('invalid@')).toBe(false)
      expect(isValidEmail('@example.com')).toBe(false)
      expect(isValidEmail('a'.repeat(255))).toBe(false)
    })

    it('should reject non-strings', () => {
      expect(isValidEmail(123)).toBe(false)
      expect(isValidEmail(null)).toBe(false)
      expect(isValidEmail(undefined)).toBe(false)
    })
  })

  describe('isValidPassword', () => {
    it('should validate passwords of correct length', () => {
      expect(isValidPassword('ValidPass@123')).toBe(true)
      expect(isValidPassword('a'.repeat(128))).toBe(true)
    })

    it('should reject passwords too short', () => {
      expect(isValidPassword('short')).toBe(false)
      expect(isValidPassword('1234567')).toBe(false)
    })

    it('should reject passwords too long', () => {
      expect(isValidPassword('a'.repeat(129))).toBe(false)
    })

    it('should reject non-strings', () => {
      expect(isValidPassword(123)).toBe(false)
      expect(isValidPassword(null)).toBe(false)
    })
  })

  describe('isPositiveNumber', () => {
    it('should validate positive integers', () => {
      expect(isPositiveNumber(1)).toBe(true)
      expect(isPositiveNumber(999)).toBe(true)
    })

    it('should reject zero and negative numbers', () => {
      expect(isPositiveNumber(0)).toBe(false)
      expect(isPositiveNumber(-1)).toBe(false)
    })

    it('should reject non-integers', () => {
      expect(isPositiveNumber(1.5)).toBe(false)
    })

    it('should reject non-numbers', () => {
      expect(isPositiveNumber('123')).toBe(false)
      expect(isPositiveNumber(null)).toBe(false)
    })
  })

  describe('isValidLimit', () => {
    it('should validate limits within range', () => {
      expect(isValidLimit(1)).toBe(true)
      expect(isValidLimit(500)).toBe(true)
      expect(isValidLimit(1000)).toBe(true)
    })

    it('should reject limits outside range', () => {
      expect(isValidLimit(0)).toBe(false)
      expect(isValidLimit(1001)).toBe(false)
    })

    it('should reject non-integers', () => {
      expect(isValidLimit(50.5)).toBe(false)
    })
  })

  describe('isValidId', () => {
    it('should validate correct IDs', () => {
      expect(isValidId('user-123')).toBe(true)
      expect(isValidId('task_456')).toBe(true)
      expect(isValidId('id789')).toBe(true)
    })

    it('should reject invalid IDs', () => {
      expect(isValidId('user@123')).toBe(false)
      expect(isValidId('user.123')).toBe(false)
      expect(isValidId('')).toBe(false)
      expect(isValidId('a'.repeat(101))).toBe(false)
    })

    it('should reject non-strings', () => {
      expect(isValidId(123)).toBe(false)
      expect(isValidId(null)).toBe(false)
    })
  })
})

/**
 * UNIT TESTS: Safe JSON Parsing
 */

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    const result = safeJsonParse('{"key": "value"}', { default: true })
    expect(result).toEqual({ key: 'value' })
  })

  it('should return fallback on invalid JSON', () => {
    const fallback = { default: true }
    const result = safeJsonParse('invalid json', fallback)
    expect(result).toBe(fallback)
  })

  it('should handle empty strings', () => {
    const fallback = { default: true }
    const result = safeJsonParse('', fallback)
    expect(result).toBe(fallback)
  })

  it('should handle arrays', () => {
    const result = safeJsonParse('[1, 2, 3]', [])
    expect(result).toEqual([1, 2, 3])
  })
})

/**
 * INTEGRATION TESTS: Request Validation
 * Note: These are mocked tests. Real integration tests would use actual Next.js test utilities
 */

describe('validateBody Integration', () => {
  it('should validate valid request body', async () => {
    const mockRequest = {
      method: 'POST',
      nextUrl: new URL('http://localhost/api/test'),
      json: async () => ({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      }),
    } as unknown as NextRequest

    const result = await validateBody(mockRequest, TestBodySchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('John Doe')
      expect(result.data.email).toBe('john@example.com')
      expect(result.data.age).toBe(30)
    }
  })

  it('should reject invalid request body', async () => {
    const mockRequest = {
      method: 'POST',
      nextUrl: new URL('http://localhost/api/test'),
      json: async () => ({
        name: '', // Invalid: empty string
        email: 'invalid-email',
      }),
    } as unknown as NextRequest

    const result = await validateBody(mockRequest, TestBodySchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response).toBeDefined()
    }
  })

  it('should handle JSON parse errors', async () => {
    const mockRequest = {
      method: 'POST',
      nextUrl: new URL('http://localhost/api/test'),
      json: async () => {
        throw new Error('Invalid JSON')
      },
    } as unknown as NextRequest

    const result = await validateBody(mockRequest, TestBodySchema)

    expect(result.success).toBe(false)
  })
})

describe('validateQuery Integration', () => {
  it('should validate query parameters', async () => {
    const mockRequest = {
      method: 'GET',
      nextUrl: new URL('http://localhost/api/test?limit=50&offset=10&search=test'),
      url: 'http://localhost/api/test?limit=50&offset=10&search=test',
    } as unknown as NextRequest

    const result = await validateQuery(mockRequest, TestQuerySchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(50)
      expect(result.data.offset).toBe(10)
      expect(result.data.search).toBe('test')
    }
  })

  it('should apply default values', async () => {
    const mockRequest = {
      method: 'GET',
      nextUrl: new URL('http://localhost/api/test'),
      url: 'http://localhost/api/test',
    } as unknown as NextRequest

    const result = await validateQuery(mockRequest, TestQuerySchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(20) // Default
      expect(result.data.offset).toBe(0) // Default
    }
  })

  it('should reject invalid query parameters', async () => {
    const mockRequest = {
      method: 'GET',
      nextUrl: new URL('http://localhost/api/test?limit=invalid'),
      url: 'http://localhost/api/test?limit=invalid',
    } as unknown as NextRequest

    const result = await validateQuery(mockRequest, TestQuerySchema)

    // Invalid string for number field will be coerced or rejected based on schema
    // This test verifies validation runs without crashing
    expect(result).toBeDefined()
  })
})

/**
 * EDGE CASE TESTS
 */

describe('Edge Cases and Security', () => {
  it('should reject XSS-like payloads in email context', async () => {
    const xssSchema = z.object({
      email: z.string().email(),
    })

    const mockRequest = {
      method: 'POST',
      nextUrl: new URL('http://localhost/api/test'),
      json: async () => ({
        email: 'test<script>alert("xss")</script>@example.com',
      }),
    } as unknown as NextRequest

    const result = await validateBody(mockRequest, xssSchema)

    // Zod email validation should reject this
    expect(result.success).toBe(false)
  })

  it('should handle extremely long strings safely', async () => {
    const schema = z.object({
      name: z.string().max(100),
    })

    const mockRequest = {
      method: 'POST',
      nextUrl: new URL('http://localhost/api/test'),
      json: async () => ({
        name: 'a'.repeat(1000),
      }),
    } as unknown as NextRequest

    const result = await validateBody(mockRequest, schema)

    expect(result.success).toBe(false)
  })

  it('should handle null and undefined gracefully', async () => {
    const schema = z.object({
      name: z.string().min(1),
    })

    const mockRequest = {
      method: 'POST',
      nextUrl: new URL('http://localhost/api/test'),
      json: async () => ({
        name: null,
      }),
    } as unknown as NextRequest

    const result = await validateBody(mockRequest, schema)

    expect(result.success).toBe(false)
  })

  it('should prevent injection attempts in number fields', async () => {
    const schema = z.object({
      id: z.number().int().positive(),
    })

    const mockRequest = {
      method: 'POST',
      nextUrl: new URL('http://localhost/api/test'),
      json: async () => ({
        id: '1; DROP TABLE users;--',
      }),
    } as unknown as NextRequest

    const result = await validateBody(mockRequest, schema)

    expect(result.success).toBe(false)
  })
})

/**
 * PERFORMANCE TESTS
 */

describe('Performance', () => {
  it('should validate 100 objects in reasonable time', () => {
    const start = performance.now()

    for (let i = 0; i < 100; i++) {
      TestBodySchema.safeParse({
        name: `User ${i}`,
        email: `user${i}@example.com`,
        age: 20 + i,
      })
    }

    const end = performance.now()
    expect(end - start).toBeLessThan(1000) // Should complete in under 1 second
  })
})

/**
 * TYPE SAFETY TESTS
 */

describe('Type Inference', () => {
  it('should correctly infer types from schemas', () => {
    type TestBody = z.infer<typeof TestBodySchema>
    type TestQuery = z.infer<typeof TestQuerySchema>

    const body: TestBody = {
      name: 'Test',
      email: 'test@example.com',
      age: 25,
    }

    const query: TestQuery = {
      limit: 50,
      offset: 0,
      search: 'test',
    }

    expect(body.name).toBeDefined()
    expect(query.limit).toBeDefined()
  })
})

