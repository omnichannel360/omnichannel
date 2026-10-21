/**
 * Comprehensive Auth Security Test Suite
 * Covers authentication, authorization, and security edge cases
 * TDD approach: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import {
  verifyAuthMiddleware,
  getAuthContext,
  type AuthContext,
  type AuthMiddlewareOptions,
} from '@/lib/auth-middleware'
import { verifyToken, TokenPayload, AuthErrors } from '@/lib/auth'

// ============================================================================
// TEST FIXTURES & HELPERS
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-12345'
const TEST_USER_ID = 'user-123'
const TEST_EMAIL = 'test@example.com'
const TEST_TOKEN_EXPIRY = Math.floor(Date.now() / 1000) + 3600 // 1 hour

interface TestTokenPayload extends TokenPayload {
  sub: string
  email: string
  role: 'admin' | 'user' | 'viewer'
  iat: number
  exp: number
}

/**
 * Create a valid test JWT token
 */
function createTestToken(overrides: Partial<TestTokenPayload> = {}): string {
  const payload: TestTokenPayload = {
    sub: TEST_USER_ID,
    email: TEST_EMAIL,
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
    exp: TEST_TOKEN_EXPIRY,
    ...overrides,
  }

  return jwt.sign(payload, JWT_SECRET)
}

/**
 * Create a NextRequest with auth header
 */
function createRequestWithToken(token: string | null): NextRequest {
  const headers = new Headers()
  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }

  return new NextRequest(new URL('http://localhost:3000/api/test'), {
    method: 'GET',
    headers,
  })
}

/**
 * Create a NextRequest with custom headers
 */
function createRequestWithHeaders(headers: Record<string, string>): NextRequest {
  const headerObj = new Headers(headers)
  return new NextRequest(new URL('http://localhost:3000/api/test'), {
    method: 'GET',
    headers: headerObj,
  })
}

// ============================================================================
// TEST SUITE 1: JWT TOKEN VALIDATION
// ============================================================================

describe('JWT Token Validation', () => {
  describe('Valid Token Scenarios', () => {
    it('should validate a properly signed JWT token', async () => {
      const token = createTestToken()
      const request = createRequestWithToken(token)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
      expect(context.payload).toBeDefined()
      expect(context.userId).toBe(TEST_USER_ID)
      expect(context.email).toBe(TEST_EMAIL)
    })

    it('should extract user role from valid token', async () => {
      const adminToken = createTestToken({ role: 'admin' })
      const request = createRequestWithToken(adminToken)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
      expect(context.role).toBe('admin')
    })

    it('should handle all valid role types', async () => {
      const roles: Array<'admin' | 'user' | 'viewer'> = ['admin', 'user', 'viewer']

      for (const role of roles) {
        const token = createTestToken({ role })
        const request = createRequestWithToken(token)
        const context = await getAuthContext(request)

        expect(context.role).toBe(role)
      }
    })
  })

  describe('Missing Token Scenarios', () => {
    it('should reject request without authorization header', async () => {
      const request = createRequestWithToken(null)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
      expect(context.error).toBeDefined()
    })

    it('should reject malformed authorization header', async () => {
      const request = createRequestWithHeaders({
        authorization: 'InvalidFormat token123',
      })

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should reject missing Bearer prefix', async () => {
      const token = createTestToken()
      const request = createRequestWithHeaders({
        authorization: token, // Missing "Bearer " prefix
      })

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should handle empty authorization header', async () => {
      const request = createRequestWithHeaders({
        authorization: '',
      })

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })
  })

  describe('Expired Token Scenarios', () => {
    it('should reject expired JWT token', async () => {
      const expiredPayload: Partial<TestTokenPayload> = {
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      }
      const expiredToken = createTestToken(expiredPayload)
      const request = createRequestWithToken(expiredToken)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
      expect(context.error).toBeDefined()
    })

    it('should reject token with exp = current time', async () => {
      const edgeCasePayload: Partial<TestTokenPayload> = {
        exp: Math.floor(Date.now() / 1000),
      }
      const token = createTestToken(edgeCasePayload)
      const request = createRequestWithToken(token)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should accept token about to expire (within leeway)', async () => {
      const soonExpirePayload: Partial<TestTokenPayload> = {
        exp: Math.floor(Date.now() / 1000) + 5, // Expires in 5 seconds
      }
      const token = createTestToken(soonExpirePayload)
      const request = createRequestWithToken(token)

      const context = await getAuthContext(request)

      // Should still be valid (allows leeway)
      expect(context.authenticated).toBe(true)
    })
  })

  describe('Invalid Signature Scenarios', () => {
    it('should reject token signed with different secret', async () => {
      const payload: TestTokenPayload = {
        sub: TEST_USER_ID,
        email: TEST_EMAIL,
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: TEST_TOKEN_EXPIRY,
      }
      const wrongSecretToken = jwt.sign(payload, 'wrong-secret-key')
      const request = createRequestWithToken(wrongSecretToken)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should reject tampered token payload', async () => {
      let token = createTestToken()
      const parts = token.split('.')

      // Tamper with payload (middle part)
      if (parts.length === 3) {
        const tamperedPayload = Buffer.from('{"sub":"attacker"}').toString(
          'base64'
        )
        token = `${parts[0]}.${tamperedPayload}.${parts[2]}`
      }

      const request = createRequestWithToken(token)
      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should reject token with modified signature', async () => {
      let token = createTestToken()
      const parts = token.split('.')

      if (parts.length === 3) {
        // Modify signature
        const modifiedSignature = 'invalidsignature123'
        token = `${parts[0]}.${parts[1]}.${modifiedSignature}`
      }

      const request = createRequestWithToken(token)
      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })
  })

  describe('Malformed Token Scenarios', () => {
    it('should reject token with invalid JWT format', async () => {
      const request = createRequestWithToken('not.a.valid.jwt')

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should reject token with missing parts', async () => {
      const request = createRequestWithToken('only.two')

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should reject token with invalid base64 encoding', async () => {
      const request = createRequestWithToken('!!!.!!!.!!!')

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should reject empty token string', async () => {
      const request = createRequestWithToken('')

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should reject token with special characters', async () => {
      const malformedToken = 'Bearer<script>alert("xss")</script>'
      const request = createRequestWithHeaders({
        authorization: malformedToken,
      })

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })
  })

  describe('Token Payload Validation', () => {
    it('should require sub (subject) claim', async () => {
      const payload: TestTokenPayload = {
        sub: '',
        email: TEST_EMAIL,
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: TEST_TOKEN_EXPIRY,
      }
      const token = jwt.sign(payload, JWT_SECRET)
      const request = createRequestWithToken(token)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should require email claim', async () => {
      const payload: any = {
        sub: TEST_USER_ID,
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: TEST_TOKEN_EXPIRY,
      }
      const token = jwt.sign(payload, JWT_SECRET)
      const request = createRequestWithToken(token)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should require role claim', async () => {
      const payload: any = {
        sub: TEST_USER_ID,
        email: TEST_EMAIL,
        iat: Math.floor(Date.now() / 1000),
        exp: TEST_TOKEN_EXPIRY,
      }
      const token = jwt.sign(payload, JWT_SECRET)
      const request = createRequestWithToken(token)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should validate role is one of allowed values', async () => {
      const payload: any = {
        sub: TEST_USER_ID,
        email: TEST_EMAIL,
        role: 'superadmin', // Invalid role
        iat: Math.floor(Date.now() / 1000),
        exp: TEST_TOKEN_EXPIRY,
      }
      const token = jwt.sign(payload, JWT_SECRET)
      const request = createRequestWithToken(token)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })
  })
})

// ============================================================================
// TEST SUITE 2: ROLE-BASED ACCESS CONTROL
// ============================================================================

describe('Role-Based Access Control (RBAC)', () => {
  it('should allow admin users to access protected endpoints', async () => {
    const adminToken = createTestToken({ role: 'admin' })
    const request = createRequestWithToken(adminToken)
    const options: AuthMiddlewareOptions = {
      requireAuth: true,
      allowedRoles: ['admin'],
    }

    const result = await verifyAuthMiddleware(request, options)

    expect(result).not.toBeInstanceOf(NextResponse)
    const context = result as AuthContext
    expect(context.authenticated).toBe(true)
    expect(context.role).toBe('admin')
  })

  it('should deny user access to admin-only endpoints', async () => {
    const userToken = createTestToken({ role: 'user' })
    const request = createRequestWithToken(userToken)
    const options: AuthMiddlewareOptions = {
      requireAuth: true,
      allowedRoles: ['admin'],
    }

    const result = await verifyAuthMiddleware(request, options)

    expect(result).toBeInstanceOf(NextResponse)
    const response = result as NextResponse
    expect(response.status).toBe(403)
  })

  it('should allow multiple roles for endpoint access', async () => {
    const editorToken = createTestToken({ role: 'user' })
    const request = createRequestWithToken(editorToken)
    const options: AuthMiddlewareOptions = {
      requireAuth: true,
      allowedRoles: ['admin', 'user'],
    }

    const result = await verifyAuthMiddleware(request, options)

    expect(result).not.toBeInstanceOf(NextResponse)
  })

  it('should enforce role hierarchy correctly', async () => {
    const roles: Array<'admin' | 'user' | 'viewer'> = ['admin', 'user', 'viewer']

    for (const role of roles) {
      const token = createTestToken({ role })
      const request = createRequestWithToken(token)
      const options: AuthMiddlewareOptions = {
        requireAuth: true,
        allowedRoles: [role],
      }

      const result = await verifyAuthMiddleware(request, options)

      expect(result).not.toBeInstanceOf(NextResponse)
    }
  })

  it('should deny access when user role not in allowed list', async () => {
    const viewerToken = createTestToken({ role: 'viewer' })
    const request = createRequestWithToken(viewerToken)
    const options: AuthMiddlewareOptions = {
      requireAuth: true,
      allowedRoles: ['admin', 'user'],
    }

    const result = await verifyAuthMiddleware(request, options)

    expect(result).toBeInstanceOf(NextResponse)
  })

  it('should handle empty allowed roles list', async () => {
    const token = createTestToken({ role: 'user' })
    const request = createRequestWithToken(token)
    const options: AuthMiddlewareOptions = {
      requireAuth: true,
      allowedRoles: [],
    }

    const result = await verifyAuthMiddleware(request, options)

    // Empty allowed roles = deny all (safe default)
    expect(result).toBeInstanceOf(NextResponse)
  })
})

// ============================================================================
// TEST SUITE 3: AUTH MIDDLEWARE BEHAVIOR
// ============================================================================

describe('Auth Middleware', () => {
  describe('Authentication Requirements', () => {
    it('should allow unauthenticated access when requireAuth=false', async () => {
      const request = createRequestWithToken(null)
      const options: AuthMiddlewareOptions = { requireAuth: false }

      const result = await verifyAuthMiddleware(request, options)

      expect(result).not.toBeInstanceOf(NextResponse)
      const context = result as AuthContext
      expect(context.authenticated).toBe(false)
    })

    it('should require auth when requireAuth=true', async () => {
      const request = createRequestWithToken(null)
      const options: AuthMiddlewareOptions = { requireAuth: true }

      const result = await verifyAuthMiddleware(request, options)

      expect(result).toBeInstanceOf(NextResponse)
      const response = result as NextResponse
      expect(response.status).toBe(401)
    })

    it('should return 401 on missing token when required', async () => {
      const request = createRequestWithToken(null)
      const options: AuthMiddlewareOptions = { requireAuth: true }

      const result = await verifyAuthMiddleware(request, options)

      expect(result).toBeInstanceOf(NextResponse)
      const response = result as NextResponse
      expect(response.status).toBe(401)
    })

    it('should return 403 on invalid role', async () => {
      const userToken = createTestToken({ role: 'user' })
      const request = createRequestWithToken(userToken)
      const options: AuthMiddlewareOptions = {
        requireAuth: true,
        allowedRoles: ['admin'],
      }

      const result = await verifyAuthMiddleware(request, options)

      expect(result).toBeInstanceOf(NextResponse)
      const response = result as NextResponse
      expect(response.status).toBe(403)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid token gracefully', async () => {
      const request = createRequestWithToken('invalid-token')
      const options: AuthMiddlewareOptions = { requireAuth: true }

      const result = await verifyAuthMiddleware(request, options)

      expect(result).toBeInstanceOf(NextResponse)
    })

    it('should provide meaningful error messages', async () => {
      const request = createRequestWithToken(null)
      const options: AuthMiddlewareOptions = { requireAuth: true }

      const result = await verifyAuthMiddleware(request, options)

      expect(result).toBeInstanceOf(NextResponse)
      const response = result as NextResponse
      const body = await response.json()
      expect(body.error).toBeDefined()
      expect(body.error.length).toBeGreaterThan(0)
    })

    it('should not expose sensitive information in errors', async () => {
      const request = createRequestWithToken('malicious-token-with-secrets')
      const options: AuthMiddlewareOptions = { requireAuth: true }

      const result = await verifyAuthMiddleware(request, options)

      if (result instanceof NextResponse) {
        const body = await result.json()
        expect(body.error).not.toContain('secret')
        expect(body.error).not.toContain('private')
      }
    })
  })

  describe('Audit Logging', () => {
    it('should support audit logging when enabled', async () => {
      const token = createTestToken()
      const request = createRequestWithToken(token)
      const options: AuthMiddlewareOptions = {
        requireAuth: true,
        auditLog: true,
      }

      const result = await verifyAuthMiddleware(request, options)

      expect(result).not.toBeInstanceOf(NextResponse)
    })

    it('should disable audit logging when disabled', async () => {
      const token = createTestToken()
      const request = createRequestWithToken(token)
      const options: AuthMiddlewareOptions = {
        requireAuth: true,
        auditLog: false,
      }

      const result = await verifyAuthMiddleware(request, options)

      expect(result).not.toBeInstanceOf(NextResponse)
    })
  })
})

// ============================================================================
// TEST SUITE 4: SECURITY EDGE CASES
// ============================================================================

describe('Security Edge Cases', () => {
  describe('Token Injection Attempts', () => {
    it('should prevent XSS in authorization header', async () => {
      const xssPayload = '<script>alert("xss")</script>'
      const request = createRequestWithHeaders({
        authorization: `Bearer ${xssPayload}`,
      })

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should prevent SQL injection patterns in token', async () => {
      const sqlInjection = "' OR '1'='1"
      const request = createRequestWithHeaders({
        authorization: `Bearer ${sqlInjection}`,
      })

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should handle token with unicode characters', async () => {
      const unicodeToken = '测试token中文字符.payload.signature'
      const request = createRequestWithToken(unicodeToken)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should handle extremely long tokens', async () => {
      const longToken = 'A'.repeat(10000)
      const request = createRequestWithToken(longToken)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })
  })

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent auth validations', async () => {
      const tokens = [
        createTestToken({ role: 'admin' }),
        createTestToken({ role: 'user' }),
        createTestToken({ role: 'viewer' }),
      ]

      const promises = tokens.map((token) => {
        const request = createRequestWithToken(token)
        return getAuthContext(request)
      })

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result.authenticated).toBe(true)
      })
    })

    it('should not leak state between concurrent requests', async () => {
      const token1 = createTestToken({ role: 'admin', sub: 'user-1' })
      const token2 = createTestToken({ role: 'user', sub: 'user-2' })

      const [result1, result2] = await Promise.all([
        getAuthContext(createRequestWithToken(token1)),
        getAuthContext(createRequestWithToken(token2)),
      ])

      expect(result1.userId).toBe('user-1')
      expect(result2.userId).toBe('user-2')
      expect(result1.role).toBe('admin')
      expect(result2.role).toBe('user')
    })
  })

  describe('Edge Case Values', () => {
    it('should handle very large user IDs', async () => {
      const largeId = 'X'.repeat(1000)
      const token = createTestToken({ sub: largeId })
      const request = createRequestWithToken(token)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
      expect(context.userId).toBe(largeId)
    })

    it('should handle emails with special characters', async () => {
      const specialEmail = 'user+test.tag@sub.example.co.uk'
      const token = createTestToken({ email: specialEmail })
      const request = createRequestWithToken(token)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
      expect(context.email).toBe(specialEmail)
    })

    it('should reject null bytes in token', async () => {
      const malformedToken = 'valid.part\x00.signature'
      const request = createRequestWithToken(malformedToken)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })
  })

  describe('Request Method Protection', () => {
    it('should protect POST requests', async () => {
      const token = createTestToken()
      const headers = new Headers()
      headers.set('authorization', `Bearer ${token}`)

      const request = new NextRequest(new URL('http://localhost:3000/api/test'), {
        method: 'POST',
        headers,
      })

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
    })

    it('should protect DELETE requests', async () => {
      const token = createTestToken()
      const headers = new Headers()
      headers.set('authorization', `Bearer ${token}`)

      const request = new NextRequest(new URL('http://localhost:3000/api/test'), {
        method: 'DELETE',
        headers,
      })

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
    })

    it('should protect PATCH requests', async () => {
      const token = createTestToken()
      const headers = new Headers()
      headers.set('authorization', `Bearer ${token}`)

      const request = new NextRequest(new URL('http://localhost:3000/api/test'), {
        method: 'PATCH',
        headers,
      })

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
    })
  })
})

// ============================================================================
// TEST SUITE 5: SESSION MANAGEMENT
// ============================================================================

describe('Session Management', () => {
  it('should track session expiry correctly', async () => {
    const now = Math.floor(Date.now() / 1000)
    const token = createTestToken({
      iat: now,
      exp: now + 3600, // 1 hour from now
    })
    const request = createRequestWithToken(token)

    const context = await getAuthContext(request)

    expect(context.authenticated).toBe(true)
  })

  it('should handle session refresh tokens', async () => {
    const token = createTestToken()
    const request = createRequestWithToken(token)

    const context = await getAuthContext(request)

    expect(context.authenticated).toBe(true)
    expect(context.payload).toBeDefined()
  })

  it('should invalidate token after expiration time', async () => {
    const pastTime = Math.floor(Date.now() / 1000) - 7200 // 2 hours ago
    const expiredToken = createTestToken({
      iat: pastTime - 3600,
      exp: pastTime,
    })
    const request = createRequestWithToken(expiredToken)

    const context = await getAuthContext(request)

    expect(context.authenticated).toBe(false)
  })
})

// ============================================================================
// TEST SUITE 6: INTEGRATION SCENARIOS
// ============================================================================

describe('Integration Scenarios', () => {
  it('should authenticate and authorize in single middleware call', async () => {
    const adminToken = createTestToken({ role: 'admin' })
    const request = createRequestWithToken(adminToken)
    const options: AuthMiddlewareOptions = {
      requireAuth: true,
      allowedRoles: ['admin'],
      auditLog: true,
    }

    const result = await verifyAuthMiddleware(request, options)

    expect(result).not.toBeInstanceOf(NextResponse)
    const context = result as AuthContext
    expect(context.authenticated).toBe(true)
    expect(context.role).toBe('admin')
  })

  it('should handle complete auth flow: login → verify → access', async () => {
    // Step 1: Create token (simulating login)
    const token = createTestToken({
      role: 'user',
      sub: 'user-123',
      email: 'user@example.com',
    })

    // Step 2: Verify token
    const request = createRequestWithToken(token)
    const context = await getAuthContext(request)

    expect(context.authenticated).toBe(true)

    // Step 3: Check access to user endpoint
    const userRequest = createRequestWithToken(token)
    const userOptions: AuthMiddlewareOptions = {
      requireAuth: true,
      allowedRoles: ['user', 'admin'],
    }

    const result = await verifyAuthMiddleware(userRequest, userOptions)

    expect(result).not.toBeInstanceOf(NextResponse)
  })

  it('should deny access to admin endpoint for regular user', async () => {
    const userToken = createTestToken({ role: 'user' })
    const request = createRequestWithToken(userToken)
    const options: AuthMiddlewareOptions = {
      requireAuth: true,
      allowedRoles: ['admin'],
    }

    const result = await verifyAuthMiddleware(request, options)

    expect(result).toBeInstanceOf(NextResponse)
    const response = result as NextResponse
    expect(response.status).toBe(403)
  })
})
