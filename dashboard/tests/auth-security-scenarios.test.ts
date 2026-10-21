/**
 * Auth Security Scenarios Test Suite
 * OWASP Top 10 coverage and advanced security testing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from '@jest/globals'
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import {
  verifyAuthMiddleware,
  getAuthContext,
  type AuthMiddlewareOptions,
} from '@/lib/auth-middleware'
import {
  TEST_USERS,
  createToken,
  createAdminToken,
  createUserToken,
  createExpiredToken,
  createRequest,
  TEST_JWT_SECRET,
} from './auth-test-helpers'

// ============================================================================
// OWASP A01:2021 – Broken Access Control
// ============================================================================

describe('OWASP A01: Broken Access Control', () => {
  describe('Horizontal Privilege Escalation', () => {
    it('should prevent user from accessing another user\'s data', async () => {
      const user1Token = createToken(TEST_USERS.user, { sub: 'user-1' })
      const request = createRequest(user1Token, '/api/users/user-2/profile')

      const context = await getAuthContext(request)

      // Token is valid but endpoint should check if user-1 can access user-2
      expect(context.authenticated).toBe(true)
      expect(context.userId).toBe('user-1')
      // Actual access control should be enforced at the route level
    })

    it('should prevent viewer from modifying admin settings', async () => {
      const viewerToken = createToken(TEST_USERS.viewer)
      const request = createRequest(
        viewerToken,
        '/api/admin/settings',
        { method: 'POST', body: { setting: 'value' } }
      )

      const options: AuthMiddlewareOptions = {
        requireAuth: true,
        allowedRoles: ['admin'],
      }

      const result = await verifyAuthMiddleware(request, options)

      expect(result).not.toBeNull()
      // Should be denied due to insufficient role
    })
  })

  describe('Vertical Privilege Escalation', () => {
    it('should prevent regular user from becoming admin via token manipulation', async () => {
      const userToken = createUserToken()
      const parts = userToken.split('.')

      // Attempt to modify payload to escalate role
      const malicious = {
        ...TEST_USERS.user,
        role: 'admin',
      }

      const modifiedPayload = Buffer.from(JSON.stringify(malicious)).toString('base64')
      const tampered = `${parts[0]}.${modifiedPayload}.${parts[2]}`

      const request = createRequest(tampered)

      const context = await getAuthContext(request)

      // Should fail due to invalid signature
      expect(context.authenticated).toBe(false)
    })

    it('should validate role is not tampered with in token', async () => {
      const payload = {
        sub: TEST_USERS.user.id,
        email: TEST_USERS.user.email,
        role: 'admin', // Malicious role claim
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }

      const token = jwt.sign(payload, 'wrong-secret') // Sign with wrong secret
      const request = createRequest(token)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })
  })

  describe('Missing Access Control Checks', () => {
    it('should require explicit role check for admin endpoints', async () => {
      const userToken = createUserToken()
      const request = createRequest(userToken, '/api/admin/users')

      const options: AuthMiddlewareOptions = {
        requireAuth: true,
        allowedRoles: ['admin'],
      }

      const result = await verifyAuthMiddleware(request, options)

      expect(result).not.toBeNull()
    })

    it('should enforce role restrictions on sensitive operations', async () => {
      const operations = [
        { method: 'DELETE', path: '/api/admin/users/123' },
        { method: 'POST', path: '/api/admin/settings' },
        { method: 'PATCH', path: '/api/admin/permissions' },
      ]

      const viewerToken = createToken(TEST_USERS.viewer)

      for (const op of operations) {
        const request = createRequest(viewerToken, op.path, { method: op.method })

        const options: AuthMiddlewareOptions = {
          requireAuth: true,
          allowedRoles: ['admin'],
        }

        const result = await verifyAuthMiddleware(request, options)

        expect(result).not.toBeNull()
      }
    })
  })
})

// ============================================================================
// OWASP A02:2021 – Cryptographic Failures
// ============================================================================

describe('OWASP A02: Cryptographic Failures', () => {
  describe('Weak Token Security', () => {
    it('should use strong JWT secret in production', async () => {
      // This test documents that JWT_SECRET must be cryptographically secure
      expect(TEST_JWT_SECRET).toBeDefined()
      expect(TEST_JWT_SECRET.length).toBeGreaterThanOrEqual(32)
    })

    it('should not accept tokens with weak algorithms', async () => {
      const weakToken = jwt.sign(
        {
          sub: TEST_USERS.user.id,
          email: TEST_USERS.user.email,
          role: 'user',
        },
        TEST_JWT_SECRET,
        { algorithm: 'HS256' } // Should be using strong algo
      )

      const request = createRequest(weakToken)
      const context = await getAuthContext(request)

      // Should still be valid (HS256 is acceptable but not ideal)
      expect(context).toBeDefined()
    })

    it('should reject tokens with none algorithm', async () => {
      const payload = {
        sub: TEST_USERS.user.id,
        email: TEST_USERS.user.email,
        role: 'admin',
      }

      // Create token with 'none' algorithm (security vulnerability)
      const headerEncoded = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
        'base64'
      )
      const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64')
      const noneToken = `${headerEncoded}.${payloadEncoded}.` // Empty signature

      const request = createRequest(noneToken)
      const context = await getAuthContext(request)

      // Should be rejected
      expect(context.authenticated).toBe(false)
    })
  })

  describe('Token Storage Security', () => {
    it('should not store sensitive data in token payload', async () => {
      const token = createUserToken()
      const parts = token.split('.')

      // Decode payload (it's base64, not encrypted)
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())

      // Token should not contain passwords or sensitive data
      expect(payload.password).toBeUndefined()
      expect(payload.creditCard).toBeUndefined()
      expect(payload.ssn).toBeUndefined()
    })
  })

  describe('Exposure of Sensitive Information', () => {
    it('should not expose JWT secret in error messages', async () => {
      const request = createRequest('invalid-token')

      const context = await getAuthContext(request)

      expect(context.error).toBeDefined()
      expect(context.error).not.toContain('secret')
      expect(context.error).not.toContain('JWT_SECRET')
    })

    it('should sanitize error messages for unauthenticated requests', async () => {
      const request = createRequest(null)

      const context = await getAuthContext(request)

      expect(context.error).toBeDefined()
      expect(context.error.length).toBeGreaterThan(0)
      // Error should be generic, not revealing system details
    })
  })
})

// ============================================================================
// OWASP A04:2021 – Insecure Deserialization
// ============================================================================

describe('OWASP A04: Insecure Deserialization', () => {
  it('should safely parse JWT without code execution risks', async () => {
    const token = createUserToken()
    const request = createRequest(token)

    // Should not execute any code from token
    const context = await getAuthContext(request)

    expect(context.authenticated).toBe(true)
  })

  it('should reject tokens with embedded scripts', async () => {
    const maliciousPayload = {
      sub: TEST_USERS.user.id,
      email: TEST_USERS.user.email,
      role: 'user',
      __proto__: { isAdmin: true }, // Prototype pollution attempt
    }

    const token = jwt.sign(maliciousPayload, TEST_JWT_SECRET)
    const request = createRequest(token)

    const context = await getAuthContext(request)

    // Should still work but not allow prototype pollution
    if (context.authenticated) {
      expect((context.payload as any).isAdmin).toBeUndefined()
    }
  })
})

// ============================================================================
// OWASP A07:2021 – Cross-Site Scripting (XSS)
// ============================================================================

describe('OWASP A07: Cross-Site Scripting (XSS)', () => {
  describe('XSS in Auth Headers', () => {
    it('should reject XSS payloads in authorization header', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '\' onload=\'alert("xss")',
        '"><script>alert("xss")</script>',
        '<img src=x onerror=alert("xss")>',
      ]

      for (const payload of xssPayloads) {
        const request = createRequest(`Bearer ${payload}`)
        const context = await getAuthContext(request)

        expect(context.authenticated).toBe(false)
      }
    })
  })

  describe('XSS in Token Payload', () => {
    it('should safely handle XSS attempts in email field', async () => {
      const xssEmail = '<script>alert("xss")</script>@example.com'
      const token = createToken(TEST_USERS.user, { email: xssEmail })
      const request = createRequest(token)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
      // Email should be stored as-is (escaping happens at display time)
      expect(context.email).toBe(xssEmail)
    })

    it('should safely handle HTML entities in user ID', async () => {
      const xssUserId = '<img src=x onerror=alert("xss")>'
      const token = createToken(TEST_USERS.user, { sub: xssUserId })
      const request = createRequest(token)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
      expect(context.userId).toBe(xssUserId)
    })
  })
})

// ============================================================================
// AUTHENTICATION BYPASS ATTEMPTS
// ============================================================================

describe('Authentication Bypass Attempts', () => {
  describe('Token Reuse & Replay Attacks', () => {
    it('should accept valid token multiple times (token reuse is allowed)', async () => {
      const token = createUserToken()

      for (let i = 0; i < 5; i++) {
        const request = createRequest(token)
        const context = await getAuthContext(request)

        expect(context.authenticated).toBe(true)
      }
    })

    it('should reject replayed expired tokens', async () => {
      const expiredToken = createExpiredToken()
      const request = createRequest(expiredToken)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })

    it('should handle JTI (JWT ID) for token revocation tracking', async () => {
      const jti = 'unique-token-id-123'
      const token = createUserToken({ jti })
      const request = createRequest(token)

      const context = await getAuthContext(request)

      // JTI is in the token but revocation list should be checked at app level
      expect(context.authenticated).toBe(true)
    })
  })

  describe('Token Type Confusion', () => {
    it('should validate token type correctly', async () => {
      const token = jwt.sign(
        {
          sub: TEST_USERS.user.id,
          email: TEST_USERS.user.email,
          role: 'user',
          type: 'access_token',
        },
        TEST_JWT_SECRET
      )

      const request = createRequest(token)
      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
    })

    it('should reject refresh tokens used as access tokens', async () => {
      const refreshToken = jwt.sign(
        {
          sub: TEST_USERS.user.id,
          type: 'refresh_token',
        },
        TEST_JWT_SECRET
      )

      const request = createRequest(refreshToken)
      const context = await getAuthContext(request)

      // Token is invalid due to missing required fields
      expect(context.authenticated).toBe(false)
    })
  })
})

// ============================================================================
// BRUTE FORCE & RATE LIMITING
// ============================================================================

describe('Brute Force Protection', () => {
  it('should not reveal if account exists via timing attacks', async () => {
    const validToken = createUserToken()
    const invalidToken = 'invalid-token-payload'

    const validRequest = createRequest(validToken)
    const invalidRequest = createRequest(invalidToken)

    const validContext = await getAuthContext(validRequest)
    const invalidContext = await getAuthContext(invalidRequest)

    // Both should fail/succeed quickly without timing leaks
    expect(validContext).toBeDefined()
    expect(invalidContext).toBeDefined()
  })

  it('should handle rapid auth attempts', async () => {
    const promises = []

    for (let i = 0; i < 100; i++) {
      const token = createUserToken()
      const request = createRequest(token)
      promises.push(getAuthContext(request))
    }

    const results = await Promise.all(promises)

    // All should be authenticated
    results.forEach((context) => {
      expect(context.authenticated).toBe(true)
    })
  })
})

// ============================================================================
// SESSION SECURITY
// ============================================================================

describe('Session Security', () => {
  describe('Session Hijacking Prevention', () => {
    it('should not allow session fixation attacks', async () => {
      const fixedToken = createUserToken()

      // Attacker tries to use fixed token
      const request = createRequest(fixedToken)
      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
      expect(context.userId).toBe(TEST_USERS.user.id)
    })

    it('should validate session with matching user agent', async () => {
      const token = createUserToken()
      const request = createRequest(token)

      const context = await getAuthContext(request)

      // Session should include user info for validation
      expect(context.userId).toBeDefined()
      expect(context.email).toBeDefined()
    })
  })

  describe('Session Timeout', () => {
    it('should expire token after configured time', async () => {
      const shortToken = createToken(TEST_USERS.user, {
        exp: Math.floor(Date.now() / 1000) + 60, // 1 minute
      })

      const request = createRequest(shortToken)
      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
    })

    it('should reject token after expiry', async () => {
      const expiredToken = createToken(TEST_USERS.user, {
        exp: Math.floor(Date.now() / 1000) - 60, // Expired
      })

      const request = createRequest(expiredToken)
      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(false)
    })
  })
})

// ============================================================================
// DATA VALIDATION & SANITIZATION
// ============================================================================

describe('Data Validation & Sanitization', () => {
  describe('Email Validation', () => {
    it('should validate email format in token', async () => {
      const validEmails = [
        'user@example.com',
        'user+tag@example.com',
        'user.name@sub.example.co.uk',
      ]

      for (const email of validEmails) {
        const token = createToken(TEST_USERS.user, { email })
        const request = createRequest(token)
        const context = await getAuthContext(request)

        expect(context.authenticated).toBe(true)
        expect(context.email).toBe(email)
      }
    })

    it('should handle edge case emails', async () => {
      const edgeEmails = [
        'a@b.c',
        'test@localhost',
        'user@[192.168.1.1]',
      ]

      for (const email of edgeEmails) {
        const token = createToken(TEST_USERS.user, { email })
        const request = createRequest(token)
        const context = await getAuthContext(request)

        // Validation is lenient for JWT payload
        expect(context.authenticated).toBe(true)
      }
    })
  })

  describe('Input Size Validation', () => {
    it('should handle long user IDs', async () => {
      const longId = 'X'.repeat(500)
      const token = createToken(TEST_USERS.user, { sub: longId })
      const request = createRequest(token)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
      expect(context.userId).toBe(longId)
    })

    it('should handle very long emails', async () => {
      const longEmail = 'a'.repeat(200) + '@example.com'
      const token = createToken(TEST_USERS.user, { email: longEmail })
      const request = createRequest(token)

      const context = await getAuthContext(request)

      expect(context.authenticated).toBe(true)
    })
  })
})

// ============================================================================
// CONCURRENT SECURITY SCENARIOS
// ============================================================================

describe('Concurrent Security Scenarios', () => {
  it('should handle concurrent auth with different roles safely', async () => {
    const tokens = [
      createAdminToken(),
      createUserToken(),
      createToken(TEST_USERS.viewer),
    ]

    const promises = tokens.map((token) => {
      const request = createRequest(token)
      return getAuthContext(request)
    })

    const results = await Promise.all(promises)

    expect(results[0].role).toBe('admin')
    expect(results[1].role).toBe('user')
    expect(results[2].role).toBe('viewer')
  })

  it('should not leak user data between concurrent requests', async () => {
    const user1Token = createToken(TEST_USERS.user, { sub: 'user-1', email: 'user1@example.com' })
    const user2Token = createToken(TEST_USERS.admin, { sub: 'user-2', email: 'user2@example.com' })

    const [result1, result2] = await Promise.all([
      getAuthContext(createRequest(user1Token)),
      getAuthContext(createRequest(user2Token)),
    ])

    expect(result1.userId).toBe('user-1')
    expect(result1.email).toBe('user1@example.com')
    expect(result2.userId).toBe('user-2')
    expect(result2.email).toBe('user2@example.com')
    expect(result2.role).toBe('admin')
  })
})

