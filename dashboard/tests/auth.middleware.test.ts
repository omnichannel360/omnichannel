import { NextRequest } from 'next/server'
import { verifyAuth, isPublicEndpoint } from '@/lib/auth'
import { signToken, verifyToken, extractToken, isTokenExpired } from '@/lib/auth/jwt'

describe('Authentication Middleware', () => {
  describe('isPublicEndpoint', () => {
    it('should identify health endpoints as public', () => {
      expect(isPublicEndpoint('/api/health')).toBe(true)
      expect(isPublicEndpoint('/api/health/status')).toBe(true)
    })

    it('should identify protected endpoints as not public', () => {
      expect(isPublicEndpoint('/api/alerts')).toBe(false)
      expect(isPublicEndpoint('/api/brain')).toBe(false)
      expect(isPublicEndpoint('/api/profiles')).toBe(false)
    })
  })

  describe('JWT Token Operations', () => {
    const testPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user' as const,
    }

    it('should sign and verify a valid token', async () => {
      const token = await signToken(testPayload)
      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')

      const verified = await verifyToken(token)
      expect(verified.userId).toBe(testPayload.userId)
      expect(verified.email).toBe(testPayload.email)
      expect(verified.role).toBe(testPayload.role)
    })

    it('should reject invalid tokens', async () => {
      const invalidToken = 'invalid.token.here'
      
      await expect(verifyToken(invalidToken)).rejects.toThrow()
    })

    it('should extract token from Bearer header', () => {
      const authHeader = 'Bearer valid-token-string'
      const token = extractToken(authHeader)
      
      expect(token).toBe('valid-token-string')
    })

    it('should reject malformed Bearer headers', () => {
      expect(extractToken('invalid-header')).toBeNull()
      expect(extractToken('Bearer')).toBeNull()
      expect(extractToken('bearer token extra')).toBeNull()
      expect(extractToken(null)).toBeNull()
    })

    it('should detect expired tokens', () => {
      const expiredPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'user' as const,
        iat: Math.floor(Date.now() / 1000) - 86400,
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      }

      expect(isTokenExpired(expiredPayload)).toBe(true)
    })

    it('should detect non-expired tokens', () => {
      const validPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'user' as const,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400, // Expires in 24 hours
      }

      expect(isTokenExpired(validPayload)).toBe(false)
    })
  })

  describe('Request Authentication', () => {
    it('should allow public endpoints without tokens', async () => {
      const request = new NextRequest('http://localhost:3000/api/health', {
        method: 'GET',
      })

      const result = await verifyAuth(request)
      expect(result.authenticated).toBe(true)
    })

    it('should reject missing authorization header on protected endpoints', async () => {
      const request = new NextRequest('http://localhost:3000/api/alerts', {
        method: 'GET',
      })

      const result = await verifyAuth(request)
      expect(result.authenticated).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should accept valid JWT token in Authorization header', async () => {
      const testPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'user' as const,
      }

      const token = await signToken(testPayload)
      const request = new NextRequest('http://localhost:3000/api/alerts', {
        method: 'GET',
        headers: {
          'authorization': `Bearer ${token}`,
        },
      })

      const result = await verifyAuth(request)
      expect(result.authenticated).toBe(true)
      expect(result.user?.userId).toBe(testPayload.userId)
    })

    it('should reject invalid tokens', async () => {
      const request = new NextRequest('http://localhost:3000/api/alerts', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer invalid-token-string',
        },
      })

      const result = await verifyAuth(request)
      expect(result.authenticated).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle case-insensitive Bearer prefix', async () => {
      const testPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'user' as const,
      }

      const token = await signToken(testPayload)
      const request = new NextRequest('http://localhost:3000/api/alerts', {
        method: 'GET',
        headers: {
          'authorization': `bearer ${token}`, // lowercase
        },
      })

      const result = await verifyAuth(request)
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
      const request = new NextRequest('http://localhost:3000/api/alerts', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer secret-key-exposed',
        },
      })

      const result = await verifyAuth(request)
      expect(result.authenticated).toBe(false)
      // Error message should not contain the actual token
      expect(result.error).not.toContain('secret-key-exposed')
    })
  })
})
