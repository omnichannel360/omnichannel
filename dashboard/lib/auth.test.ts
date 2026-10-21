import { generateToken, verifyToken } from '@/lib/auth'
import { NextRequest } from 'next/server'

describe('JWT Authentication', () => {
  describe('generateToken', () => {
    test('should generate a valid JWT token', async () => {
      const token = await generateToken('user-1', 'user@example.com', 'user', 3600)
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3) // JWT has 3 parts separated by dots
    })

    test('should include correct claims in token', async () => {
      const token = await generateToken('user-123', 'test@example.com', 'admin', 3600)
      // Decode the token (middle part is the payload)
      const parts = token.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
      
      expect(payload.sub).toBe('user-123')
      expect(payload.email).toBe('test@example.com')
      expect(payload.role).toBe('admin')
    })
  })

  describe('verifyToken', () => {
    test('should verify a valid token', async () => {
      const token = await generateToken('user-1', 'user@example.com', 'user', 3600)

      const request = new NextRequest(new URL('http://localhost:3000/api/test'), {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const payload = await verifyToken(request)
      expect(payload).toBeDefined()
      expect(payload?.sub).toBe('user-1')
      expect(payload?.email).toBe('user@example.com')
      expect(payload?.role).toBe('user')
    })

    test('should reject request without Authorization header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/api/test'))
      const payload = await verifyToken(request)
      expect(payload).toBeNull()
    })

    test('should reject malformed Authorization header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/api/test'), {
        headers: {
          'Authorization': 'InvalidFormat token-here',
        },
      })
      const payload = await verifyToken(request)
      expect(payload).toBeNull()
    })

    test('should reject expired token', async () => {
      // Create a token that expired 1 second ago
      const token = await generateToken('user-1', 'user@example.com', 'user', -1)

      const request = new NextRequest(new URL('http://localhost:3000/api/test'), {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const payload = await verifyToken(request)
      expect(payload).toBeNull()
    })

    test('should reject tampered token', async () => {
      const token = await generateToken('user-1', 'user@example.com', 'user', 3600)
      // Tamper with the token by changing the last character
      const tamperedToken = token.slice(0, -1) + 'X'

      const request = new NextRequest(new URL('http://localhost:3000/api/test'), {
        headers: {
          'Authorization': `Bearer ${tamperedToken}`,
        },
      })

      const payload = await verifyToken(request)
      expect(payload).toBeNull()
    })
  })
})
