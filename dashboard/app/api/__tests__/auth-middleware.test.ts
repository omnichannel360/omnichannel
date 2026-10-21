import { NextRequest, NextResponse } from 'next/server'
import { withAuth, requireAuth, checkRole } from '@/lib/middleware/auth-middleware'
import { generateToken } from '@/lib/auth'
import { TokenPayload } from '@/lib/auth'

describe('Auth Middleware', () => {
  const mockHandler = async (request: NextRequest, auth: { payload: TokenPayload; userId: string }) => {
    return NextResponse.json({ success: true, userId: auth.userId })
  }

  describe('withAuth wrapper', () => {
    it('should allow authenticated requests to proceed', async () => {
      const token = await generateToken('user-123', 'user@example.com', 'user')
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { authorization: `Bearer ${token}` },
      })
      const handler = withAuth(mockHandler)
      const response = await handler(request as any)
      const data = await response.json()
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should reject requests without authentication token', async () => {
      const request = new NextRequest('http://localhost:3000/api/test')
      const handler = withAuth(mockHandler)
      const response = await handler(request as any)
      expect(response.status).toBe(401)
    })

    it('should reject requests with invalid token', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { authorization: 'Bearer invalid.token.here' },
      })
      const handler = withAuth(mockHandler)
      const response = await handler(request as any)
      expect(response.status).toBe(401)
    })

    it('should enforce role-based access control', async () => {
      const userToken = await generateToken('user-123', 'user@example.com', 'user')
      const request = new NextRequest('http://localhost:3000/api/admin', {
        headers: { authorization: `Bearer ${userToken}` },
      })
      const handler = withAuth(mockHandler, { requiredRole: 'admin' })
      const response = await handler(request as any)
      expect(response.status).toBe(403)
    })

    it('should allow admin users to access admin endpoints', async () => {
      const adminToken = await generateToken('admin-123', 'admin@example.com', 'admin')
      const request = new NextRequest('http://localhost:3000/api/admin', {
        headers: { authorization: `Bearer ${adminToken}` },
      })
      const handler = withAuth(mockHandler, { requiredRole: 'admin' })
      const response = await handler(request as any)
      expect(response.status).toBe(200)
    })

    it('should allow public endpoints without authentication', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login')
      const handler = withAuth(mockHandler, { publicEndpoints: ['/api/auth/login'] })
      const response = await handler(request as any)
      expect(response.status).toBe(200)
    })
  })

  describe('requireAuth function', () => {
    it('should return authenticated state for valid token', async () => {
      const token = await generateToken('user-123', 'user@example.com', 'user')
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { authorization: `Bearer ${token}` },
      })
      const result = await requireAuth(request)
      expect(result.authenticated).toBe(true)
      expect(result.payload).toBeTruthy()
    })

    it('should return error response for missing token', async () => {
      const request = new NextRequest('http://localhost:3000/api/test')
      const result = await requireAuth(request)
      expect(result.authenticated).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })

  describe('checkRole function', () => {
    it('should allow access when role matches', () => {
      const payload: TokenPayload = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'admin',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      }
      const result = checkRole(payload, 'admin')
      expect(result.allowed).toBe(true)
    })

    it('should deny access when role does not match', () => {
      const payload: TokenPayload = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'user',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      }
      const result = checkRole(payload, 'admin')
      expect(result.allowed).toBe(false)
    })

    it('should allow any of multiple roles', () => {
      const payload: TokenPayload = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'moderator',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      }
      const result = checkRole(payload, ['admin', 'moderator'])
      expect(result.allowed).toBe(true)
    })

    it('should return true when no role requirement specified', () => {
      const payload: TokenPayload = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'user',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      }
      const result = checkRole(payload, undefined)
      expect(result.allowed).toBe(true)
    })
  })
})
