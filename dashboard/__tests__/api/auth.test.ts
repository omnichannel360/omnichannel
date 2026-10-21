import { createToken, verifyToken, verifyAuth, JWTPayload } from '@/lib/auth'
import { NextRequest } from 'next/server'

describe('JWT Authentication', () => {
  const testPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: 'user-123',
    email: 'test@example.com',
    role: 'admin',
  }

  describe('createToken', () => {
    it('should create a valid JWT token', async () => {
      const token = await createToken(testPayload)
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.split('.').length).toBe(3) // JWT has 3 parts
    })
  })

  describe('verifyToken', () => {
    it('should verify and decode a valid token', async () => {
      const token = await createToken(testPayload)
      const verified = await verifyToken(token)

      expect(verified).toBeDefined()
      expect(verified?.sub).toBe('user-123')
      expect(verified?.email).toBe('test@example.com')
      expect(verified?.role).toBe('admin')
    })

    it('should return null for invalid token', async () => {
      const verified = await verifyToken('invalid.token.here')
      expect(verified).toBeNull()
    })

    it('should return null for malformed token', async () => {
      const verified = await verifyToken('not-a-jwt')
      expect(verified).toBeNull()
    })
  })

  describe('verifyAuth', () => {
    it('should authenticate with valid Bearer token', async () => {
      const token = await createToken(testPayload)
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      const result = await verifyAuth(request)
      expect(result.authenticated).toBe(true)
      expect(result.payload?.sub).toBe('user-123')
    })

    it('should reject request without authorization header', async () => {
      const request = new NextRequest('http://localhost:3000/api/test')
      const result = await verifyAuth(request)

      expect(result.authenticated).toBe(false)
      expect(result.status).toBe(401)
    })

    it('should reject request with invalid token', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          authorization: 'Bearer invalid-token',
        },
      })

      const result = await verifyAuth(request)
      expect(result.authenticated).toBe(false)
      expect(result.status).toBe(401)
    })
  })
})
