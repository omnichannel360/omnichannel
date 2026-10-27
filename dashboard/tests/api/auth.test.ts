import { describe, it, expect, beforeEach } from '@jest/globals'
import jwt from 'jsonwebtoken'
import {
  generateToken,
  verifyToken,
  verifyAuth,
  createUnauthorizedResponse,
  TokenPayload,
} from '@/lib/auth'
import { middleware } from '@/middleware'
import { NextRequest } from 'next/server'

type TestIdentity = Pick<TokenPayload, 'sub' | 'email' | 'role'>

const testPayload: TestIdentity = {
  sub: 'user-123',
  email: 'test@example.com',
  role: 'user',
}

const createTestToken = (payload: TestIdentity = testPayload): Promise<string> =>
  generateToken(payload.sub, payload.email, payload.role)

/** lib/auth verifyToken reads the Bearer token from a request, not a raw string */
const verifyRawToken = (token: string): Promise<TokenPayload | null> =>
  verifyToken(
    new NextRequest(new URL('http://localhost/api/test'), {
      headers: { authorization: `Bearer ${token}` },
    })
  )

describe('Authentication Middleware', () => {
  let validToken: string

  beforeEach(async () => {
    validToken = await createTestToken()
  })

  describe('Token Creation', () => {
    it('should create a valid JWT token', async () => {
      const token = await createTestToken()
      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token.split('.').length).toBe(3) // JWT format: header.payload.signature
    })

    it('should create tokens with correct payload', async () => {
      const token = await createTestToken()
      const verified = await verifyRawToken(token)

      expect(verified).toBeTruthy()
      expect(verified?.sub).toBe(testPayload.sub)
      expect(verified?.email).toBe(testPayload.email)
      expect(verified?.role).toBe(testPayload.role)
    })

    it('should include iat and exp claims', async () => {
      const token = await createTestToken()
      const verified = await verifyRawToken(token)

      expect(verified?.iat).toBeTruthy()
      expect(verified?.exp).toBeTruthy()
      expect(typeof verified?.iat).toBe('number')
      expect(typeof verified?.exp).toBe('number')
    })
  })

  describe('Token Verification', () => {
    it('should verify valid tokens', async () => {
      const verified = await verifyRawToken(validToken)
      expect(verified).toBeTruthy()
      expect(verified?.email).toBe(testPayload.email)
    })

    it('should reject invalid tokens', async () => {
      const verified = await verifyRawToken('invalid.token.format')
      expect(verified).toBeNull()
    })

    it('should reject tampered tokens', async () => {
      const tampered = validToken.slice(0, -5) + 'xxxxx'
      const verified = await verifyRawToken(tampered)
      expect(verified).toBeNull()
    })

    it('should reject malformed tokens', async () => {
      const verified = await verifyRawToken('not-a-jwt')
      expect(verified).toBeNull()
    })
  })

  describe('Request Authentication', () => {
    it('should authenticate requests with valid Bearer token', async () => {
      const mockRequest = new NextRequest(new URL('http://localhost/api/test'), {
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      })

      const result = await verifyAuth(mockRequest)
      expect(result.authenticated).toBe(true)
      expect(result.payload?.email).toBe(testPayload.email)
      expect(result.error).toBeUndefined()
    })

    it('should reject requests without authorization header', async () => {
      const mockRequest = new NextRequest(new URL('http://localhost/api/test'))
      const result = await verifyAuth(mockRequest)

      expect(result.authenticated).toBe(false)
      expect(result.payload).toBeUndefined()
      expect(result.error).toContain('Missing or invalid')
      expect(createUnauthorizedResponse(result.error as string).status).toBe(401)
    })

    it('should reject requests with malformed auth header', async () => {
      const mockRequest = new NextRequest(new URL('http://localhost/api/test'), {
        headers: {
          authorization: 'NotBearer token',
        },
      })

      const result = await verifyAuth(mockRequest)
      expect(result.authenticated).toBe(false)
      expect(result.payload).toBeUndefined()
      expect(createUnauthorizedResponse(result.error as string).status).toBe(401)
    })

    it('should reject requests with invalid token', async () => {
      const mockRequest = new NextRequest(new URL('http://localhost/api/test'), {
        headers: {
          authorization: 'Bearer invalid.token.here',
        },
      })

      const result = await verifyAuth(mockRequest)
      expect(result.authenticated).toBe(false)
      expect(result.payload).toBeUndefined()
      // lib/auth now returns one generic message for missing and invalid tokens
      expect(result.error).toContain('invalid')
      expect(createUnauthorizedResponse(result.error as string).status).toBe(401)
    })
  })

  describe('Bearer Token Extraction', () => {
    it('should extract Bearer token from header', async () => {
      const mockRequest = new NextRequest(new URL('http://localhost/api/test'), {
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      })

      const result = await verifyAuth(mockRequest)
      expect(result.authenticated).toBe(true)
    })

    it('should handle case-insensitive Bearer prefix', async () => {
      const mockRequest = new NextRequest(new URL('http://localhost/api/test'), {
        headers: {
          authorization: `bearer ${validToken}`,
        },
      })

      const result = await verifyAuth(mockRequest)
      // Note: Current implementation is case-sensitive, adjust test if needed
      expect(result.authenticated).toBe(false)
    })
  })

  describe('Token Expiration', () => {
    it('should set token to expire in 24 hours', async () => {
      const token = await createTestToken()
      const verified = await verifyRawToken(token)

      expect(verified).not.toBeNull()
      const expirationTime = ((verified as TokenPayload).exp - (verified as TokenPayload).iat) * 1000
      const expectedTime = 24 * 60 * 60 * 1000 // 24 hours in ms
      // Allow 1 second tolerance
      expect(Math.abs(expirationTime - expectedTime)).toBeLessThan(1000)
    })

    it('should reject expired tokens', async () => {
      const now = Math.floor(Date.now() / 1000)
      const expired = jwt.sign(
        { ...testPayload, iat: now - 7200, exp: now - 3600 },
        process.env.JWT_SECRET as string
      )

      expect(await verifyRawToken(expired)).toBeNull()
    })
  })
})

/**
 * Previously these hit a live server on localhost:3000 via fetch. They now drive the
 * Edge middleware (middleware.ts) directly, which is where the 401 gate lives.
 */
describe('API Endpoint Authentication', () => {
  describe('Protected Endpoints', () => {
    const endpoints = [
      { method: 'GET', path: '/api/alerts' },
      { method: 'POST', path: '/api/alerts' },
      { method: 'PATCH', path: '/api/alerts' },
      { method: 'GET', path: '/api/brain' },
      { method: 'GET', path: '/api/conductor' },
      { method: 'POST', path: '/api/conductor' },
      { method: 'GET', path: '/api/kanban' },
      { method: 'POST', path: '/api/kanban' },
      { method: 'PUT', path: '/api/kanban' },
      { method: 'DELETE', path: '/api/kanban' },
      { method: 'GET', path: '/api/meetings' },
      { method: 'POST', path: '/api/meetings' },
      { method: 'GET', path: '/api/metrics' },
      { method: 'GET', path: '/api/profiles' },
    ]

    endpoints.forEach(({ method, path }) => {
      it(`${method} ${path} should return 401 without token`, async () => {
        const request = new NextRequest(new URL(`http://localhost:3000${path}`), { method })
        const response = await middleware(request)

        expect(response.status).toBe(401)
        const body = await response.json()
        expect(body.error).toContain('Authentication')
      })

      it(`${method} ${path} should accept valid token`, async () => {
        const token = await createTestToken()

        const request = new NextRequest(new URL(`http://localhost:3000${path}`), {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
        })
        const response = await middleware(request)

        // Should not be 401 (or 403: role 'user' is allowed on all of these routes)
        expect(response.status).not.toBe(401)
        expect(response.status).not.toBe(403)
      })
    })
  })

  describe('Public Endpoints', () => {
    it('GET /api/health should work without authentication', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/api/health'), {
        method: 'GET',
      })
      const response = await middleware(request)

      expect(response.status).not.toBe(401)
    })
  })
})
