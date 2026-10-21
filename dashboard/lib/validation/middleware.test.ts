/**
 * Test suite for validation middleware
 * Tests header validation, request size limits, and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { validateBody, validateQuery, formatZodErrors } from './middleware'
import { z, ZodError } from 'zod'

// Test schema
const testSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
})

const testQuerySchema = z.object({
  page: z.number().int().optional().default(1),
})

describe('Validation Middleware', () => {
  describe('validateBody', () => {
    it('accepts valid request bodies', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '30',
        },
        body: JSON.stringify({ name: 'John', age: 30 }),
      })

      const result = await validateBody(request, testSchema)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('John')
        expect(result.data.age).toBe(30)
      }
    })

    it('rejects requests with missing content-type header', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'content-length': '30',
        },
        body: JSON.stringify({ name: 'John', age: 30 }),
      })

      const result = await validateBody(request, testSchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        const status = (result.response as NextResponse).status
        expect(status).toBe(400)
      }
    })

    it('rejects requests with invalid content-type', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/xml',
          'content-length': '30',
        },
        body: JSON.stringify({ name: 'John', age: 30 }),
      })

      const result = await validateBody(request, testSchema)
      expect(result.success).toBe(false)
    })

    it('rejects requests exceeding size limit', async () => {
      const largeBody = JSON.stringify({
        name: 'a'.repeat(1024 * 1024 + 1),
        age: 30,
      })

      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(largeBody.length),
        },
        body: largeBody,
      })

      const result = await validateBody(request, testSchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        const status = (result.response as NextResponse).status
        expect(status).toBe(413)
      }
    })

    it('rejects invalid schema data', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '30',
        },
        body: JSON.stringify({ name: '', age: -5 }),
      })

      const result = await validateBody(request, testSchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        const status = (result.response as NextResponse).status
        expect(status).toBe(400)
      }
    })

    it('handles malformed JSON gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '10',
        },
        body: '{invalid json}',
      })

      const result = await validateBody(request, testSchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        const status = (result.response as NextResponse).status
        expect(status).toBe(400)
      }
    })

    it('accepts content-type with charset', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-length': '30',
        },
        body: JSON.stringify({ name: 'John', age: 30 }),
      })

      const result = await validateBody(request, testSchema)
      expect(result.success).toBe(true)
    })
  })

  describe('validateQuery', () => {
    it('accepts valid query parameters', async () => {
      const request = new NextRequest('http://localhost:3000/api/test?page=2', {
        method: 'GET',
      })

      const result = await validateQuery(request, testQuerySchema)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(2)
      }
    })

    it('applies default values for missing parameters', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET',
      })

      const result = await validateQuery(request, testQuerySchema)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(1)
      }
    })

    it('rejects query strings exceeding size limit', async () => {
      const largeQuery = 'param=' + 'a'.repeat(15 * 1024) // > 10KB
      const request = new NextRequest(`http://localhost:3000/api/test?${largeQuery}`, {
        method: 'GET',
      })

      const result = await validateQuery(request, testQuerySchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        const status = (result.response as NextResponse).status
        expect(status).toBe(414)
      }
    })

    it('converts string parameters to numbers', async () => {
      const request = new NextRequest('http://localhost:3000/api/test?page=5', {
        method: 'GET',
      })

      const result = await validateQuery(request, testQuerySchema)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(typeof result.data.page).toBe('number')
        expect(result.data.page).toBe(5)
      }
    })

    it('rejects invalid schema data', async () => {
      const request = new NextRequest('http://localhost:3000/api/test?page=invalid', {
        method: 'GET',
      })

      const result = await validateQuery(request, testQuerySchema)
      expect(result.success).toBe(false)
    })

    it('handles multiple query parameters', async () => {
      const multiParamSchema = z.object({
        page: z.number().optional().default(1),
        limit: z.number().optional().default(10),
        sort: z.string().optional(),
      })

      const request = new NextRequest('http://localhost:3000/api/test?page=2&limit=20&sort=name', {
        method: 'GET',
      })

      const result = await validateQuery(request, multiParamSchema)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(2)
        expect(result.data.limit).toBe(20)
        expect(result.data.sort).toBe('name')
      }
    })
  })

  describe('formatZodErrors', () => {
    it('formats single field error', () => {
      const error = new ZodError([
        {
          code: 'too_small',
          minimum: 1,
          type: 'string',
          message: 'String must contain at least 1 character(s)',
          path: ['name'],
          inclusive: true,
          exact: false,
        },
      ])

      const formatted = formatZodErrors(error)
      expect(formatted).toHaveLength(1)
      expect(formatted[0].field).toBe('name')
      expect(formatted[0].message).toBe('String must contain at least 1 character(s)')
      expect(formatted[0].code).toBe('too_small')
    })

    it('formats nested field errors', () => {
      const error = new ZodError([
        {
          code: 'invalid_type',
          expected: 'number',
          received: 'string',
          message: 'Expected number, received string',
          path: ['user', 'age'],
        },
      ])

      const formatted = formatZodErrors(error)
      expect(formatted[0].field).toBe('user.age')
    })

    it('formats multiple errors', () => {
      const error = new ZodError([
        {
          code: 'too_small',
          minimum: 1,
          type: 'string',
          message: 'String must contain at least 1 character(s)',
          path: ['name'],
          inclusive: true,
          exact: false,
        },
        {
          code: 'invalid_type',
          expected: 'number',
          received: 'string',
          message: 'Expected number, received string',
          path: ['age'],
        },
      ])

      const formatted = formatZodErrors(error)
      expect(formatted).toHaveLength(2)
      expect(formatted[0].field).toBe('name')
      expect(formatted[1].field).toBe('age')
    })
  })
})
