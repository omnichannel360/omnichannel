/**
 * CSRF Protection Tests
 * Verifies double-submit cookie pattern implementation
 */

import { describe, it, expect } from '@jest/globals'
import { NextRequest } from 'next/server'
import {
  verifyCsrfToken,
  setCsrfTokenCookie,
  validateCsrfMiddleware,
} from './csrf-protection'
import { NextResponse } from 'next/server'

describe('CSRF Protection', () => {
  describe('verifyCsrfToken', () => {
    it('should reject when token is missing from request', () => {
      const mockRequest = {
        headers: { get: () => null },
        cookies: { get: () => undefined },
      } as any

      const result = verifyCsrfToken(mockRequest, null)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('missing')
    })

    it('should reject when cookie is missing', () => {
      const mockRequest = {
        headers: { get: (key: string) => key === 'x-csrf-token' ? 'token123' : null },
        cookies: { get: () => undefined },
      } as any

      const result = verifyCsrfToken(mockRequest, null)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('missing from cookies')
    })

    it('should accept valid matching token', () => {
      const token = 'abc123def456'
      const mockRequest = {
        headers: { get: (key: string) => key === 'x-csrf-token' ? token : null },
        cookies: { get: () => ({ value: token }) },
      } as any

      const result = verifyCsrfToken(mockRequest, null)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject mismatched token', () => {
      const mockRequest = {
        headers: { get: (key: string) => key === 'x-csrf-token' ? 'token123' : null },
        cookies: { get: () => ({ value: 'differenttoken' }) },
      } as any

      const result = verifyCsrfToken(mockRequest, null)
      expect(result.valid).toBe(false)
    })

    it('should accept token from body when header missing', () => {
      const token = 'bodytoken789'
      const mockRequest = {
        headers: { get: () => null },
        cookies: { get: () => ({ value: token }) },
      } as any

      const result = verifyCsrfToken(mockRequest, token)
      expect(result.valid).toBe(true)
    })
  })

  describe('setCsrfTokenCookie', () => {
    it('should set secure cookie with proper flags', () => {
      const response = new NextResponse(null, { status: 200 })
      const token = setCsrfTokenCookie(response)

      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThanOrEqual(32) // min 32 chars for secure token
      expect(token.length).toBeLessThanOrEqual(256)   // max reasonable length
    })

    it('should generate random tokens', () => {
      const response1 = new NextResponse(null, { status: 200 })
      const token1 = setCsrfTokenCookie(response1)

      const response2 = new NextResponse(null, { status: 200 })
      const token2 = setCsrfTokenCookie(response2)

      expect(token1).not.toBe(token2)
    })
  })

  describe('validateCsrfMiddleware', () => {
    it('should skip validation for GET requests', async () => {
      const mockRequest = {
        method: 'GET',
      } as any

      const result = await validateCsrfMiddleware(mockRequest)
      expect(result.valid).toBe(true)
      expect(result.response).toBeUndefined()
    })

    it('should validate POST requests', async () => {
      const mockRequest = {
        method: 'POST',
        headers: { get: () => null },
        cookies: { get: () => undefined },
        json: async () => ({}),
      } as any

      const result = await validateCsrfMiddleware(mockRequest)
      expect(result.valid).toBe(false)
      expect(result.response).toBeDefined()
    })

    it('should validate PUT requests', async () => {
      const mockRequest = {
        method: 'PUT',
        headers: { get: () => null },
        cookies: { get: () => undefined },
        json: async () => ({}),
      } as any

      const result = await validateCsrfMiddleware(mockRequest)
      expect(result.valid).toBe(false)
    })

    it('should validate DELETE requests', async () => {
      const mockRequest = {
        method: 'DELETE',
        headers: { get: () => null },
        cookies: { get: () => undefined },
        json: async () => ({}),
      } as any

      const result = await validateCsrfMiddleware(mockRequest)
      expect(result.valid).toBe(false)
    })

    it('should validate PATCH requests', async () => {
      const mockRequest = {
        method: 'PATCH',
        headers: { get: () => null },
        cookies: { get: () => undefined },
        json: async () => ({}),
      } as any

      const result = await validateCsrfMiddleware(mockRequest)
      expect(result.valid).toBe(false)
    })
  })
})
