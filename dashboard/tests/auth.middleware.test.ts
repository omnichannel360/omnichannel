import { NextRequest } from 'next/server'
import { verifyAuth, verifyToken, generateToken, isValidTokenPayload } from '@/lib/auth'
import { isPublicRoute } from '@/lib/auth-config'
import { middleware } from '@/middleware'

/**
 * Retargeted from the removed '@/lib/auth/jwt' module:
 *   isPublicEndpoint(path)   -> isPublicRoute(path)            (lib/auth-config)
 *   signToken({userId,...})  -> generateToken(sub, email, role) (lib/auth)
 *   verifyToken(token)       -> verifyToken(request), null on failure (lib/auth)
 *   extractToken(header)     -> Bearer parsing inside verifyToken(request)
 *   isTokenExpired(payload)  -> !isValidTokenPayload(payload)  (lib/auth)
 *   result.user.userId       -> result.payload.sub
 * Public-route bypass is enforced by the Edge middleware, so those cases call middleware().
 */

const requestWithAuth = (authorization?: string, path = '/api/alerts'): NextRequest =>
  new NextRequest(`http://localhost:3000${path}`, {
    method: 'GET',
    headers: authorization === undefined ? {} : { authorization },
  })

describe('Authentication Middleware', () => {
  describe('isPublicEndpoint', () => {
    it('should identify health endpoints as public', () => {
      expect(isPublicRoute('/api/health')).toBe(true)
      expect(isPublicRoute('/api/health/status')).toBe(true)
    })

    it('should identify protected endpoints as not public', () => {
      expect(isPublicRoute('/api/alerts')).toBe(false)
      expect(isPublicRoute('/api/brain')).toBe(false)
      expect(isPublicRoute('/api/profiles')).toBe(false)
    })
  })

  describe('JWT Token Operations', () => {
    const testPayload = {
      sub: 'user-123',
      email: 'test@example.com',
      role: 'user' as const,
    }

    it('should sign and verify a valid token', async () => {
      const token = await generateToken(testPayload.sub, testPayload.email, testPayload.role)
      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')

      const verified = await verifyToken(requestWithAuth(`Bearer ${token}`))
      expect(verified).not.toBeNull()
      expect(verified?.sub).toBe(testPayload.sub)
      expect(verified?.email).toBe(testPayload.email)
      expect(verified?.role).toBe(testPayload.role)
    })

    it('should reject invalid tokens', async () => {
      const invalidToken = 'invalid.token.here'

      await expect(verifyToken(requestWithAuth(`Bearer ${invalidToken}`))).resolves.toBeNull()
    })

    it('should extract token from Bearer header', async () => {
      const token = await generateToken(testPayload.sub, testPayload.email, testPayload.role)

      const verified = await verifyToken(requestWithAuth(`Bearer ${token}`))

      expect(verified?.sub).toBe(testPayload.sub)
    })

    it('should reject malformed Bearer headers', async () => {
      const token = await generateToken(testPayload.sub, testPayload.email, testPayload.role)

      expect(await verifyToken(requestWithAuth('invalid-header'))).toBeNull()
      expect(await verifyToken(requestWithAuth('Bearer'))).toBeNull()
      expect(await verifyToken(requestWithAuth(`Bearer ${token} extra`))).toBeNull()
      expect(await verifyToken(requestWithAuth(token))).toBeNull()
      expect(await verifyToken(requestWithAuth(undefined))).toBeNull()
    })

    it('should detect expired tokens', () => {
      const expiredPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'user' as const,
        iat: Math.floor(Date.now() / 1000) - 86400,
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      }

      expect(isValidTokenPayload(expiredPayload)).toBe(false)
    })

    it('should detect non-expired tokens', () => {
      const validPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'user' as const,
        iat: Math.floor(Date.now() / 1000) - 1,
        exp: Math.floor(Date.now() / 1000) + 86400, // Expires in 24 hours
      }

      expect(isValidTokenPayload(validPayload)).toBe(true)
    })
  })

  describe('Request Authentication', () => {
    it('should allow public endpoints without tokens', async () => {
      const response = await middleware(requestWithAuth(undefined, '/api/health'))

      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })

    it('should reject missing authorization header on protected endpoints', async () => {
      const result = await verifyAuth(requestWithAuth(undefined))
      expect(result.authenticated).toBe(false)
      expect(result.error).toBeDefined()

      const response = await middleware(requestWithAuth(undefined))
      expect(response.status).toBe(401)
    })

    it('should accept valid JWT token in Authorization header', async () => {
      const token = await generateToken('user-123', 'test@example.com', 'user')

      const result = await verifyAuth(requestWithAuth(`Bearer ${token}`))
      expect(result.authenticated).toBe(true)
      expect(result.payload?.sub).toBe('user-123')
    })

    it('should reject invalid tokens', async () => {
      const result = await verifyAuth(requestWithAuth('Bearer invalid-token-string'))
      expect(result.authenticated).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle case-insensitive Bearer prefix', async () => {
      // RFC 7235 section 2.1: the auth-scheme token is case-insensitive
      const token = await generateToken('user-123', 'test@example.com', 'user')

      const result = await verifyAuth(requestWithAuth(`bearer ${token}`)) // lowercase scheme
      expect(result.authenticated).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed JSON payloads gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/alerts', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer invalid',
          'content-type': 'application/json',
        },
        body: 'invalid json',
      })

      const result = await verifyAuth(request)
      expect(result.authenticated).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should not expose sensitive error details', async () => {
      const result = await verifyAuth(requestWithAuth('Bearer secret-key-exposed'))
      expect(result.authenticated).toBe(false)
      // Error message should not contain the actual token
      expect(result.error).not.toContain('secret-key-exposed')

      const response = await middleware(requestWithAuth('Bearer secret-key-exposed'))
      expect(response.status).toBe(401)
      expect(await response.text()).not.toContain('secret-key-exposed')
    })
  })
})
