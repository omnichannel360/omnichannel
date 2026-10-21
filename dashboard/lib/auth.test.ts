import {
  generateToken,
  generateRefreshToken,
  verifyToken,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  hasRequiredRole,
  getRolePermissions,
  isValidTokenPayload,
  ROLE_PERMISSIONS,
  AuthErrors,
} from '@/lib/auth'
import { NextRequest } from 'next/server'

describe('JWT Authentication', () => {
  describe('generateToken', () => {
    test('should generate a valid JWT token', async () => {
      const token = await generateToken('user-1', 'user@example.com', 'user', 3600)
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3)
    })

    test('should include correct claims in token', async () => {
      const token = await generateToken('user-123', 'test@example.com', 'admin', 3600)
      const parts = token.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())

      expect(payload.sub).toBe('user-123')
      expect(payload.email).toBe('test@example.com')
      expect(payload.role).toBe('admin')
    })

    test('should generate token with custom expiry', async () => {
      const token = await generateToken('user-789', 'user@example.com', 'admin', 7200)
      const parts = token.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())

      expect(payload.exp - payload.iat).toBeCloseTo(7200, 5)
    })
  })

  describe('generateRefreshToken', () => {
    test('should generate a refresh token', async () => {
      const token = await generateRefreshToken('user-1', 'user@example.com')
      expect(token).toBeDefined()
      expect(token.split('.')).toHaveLength(3)
    })

    test('should mark token as refresh type', async () => {
      const token = await generateRefreshToken('user-1', 'user@example.com')
      const parts = token.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())

      expect(payload.type).toBe('refresh')
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

  describe('Permission Checking', () => {
    test('should verify admin has all permissions', () => {
      expect(hasPermission('admin', 'read:all')).toBe(true)
      expect(hasPermission('admin', 'manage:users')).toBe(true)
    })

    test('should verify user has specific permissions', () => {
      expect(hasPermission('user', 'read:own')).toBe(true)
      expect(hasPermission('user', 'write:own')).toBe(true)
    })

    test('should deny permission user does not have', () => {
      expect(hasPermission('user', 'manage:users')).toBe(false)
      expect(hasPermission('viewer', 'write:own')).toBe(false)
    })
  })

  describe('Multiple Permission Checking', () => {
    test('should verify user has all required permissions', () => {
      expect(hasAllPermissions('admin', ['read:all', 'write:all'])).toBe(true)
    })

    test('should reject when user lacks required permissions', () => {
      expect(hasAllPermissions('user', ['read:all', 'write:all'])).toBe(false)
    })

    test('should verify user has any required permission', () => {
      expect(hasAnyPermission('admin', ['read:all', 'manage:users'])).toBe(true)
      expect(hasAnyPermission('user', ['create:content', 'manage:users'])).toBe(true)
    })
  })

  describe('Role Checking', () => {
    test('should verify user has required role', () => {
      expect(hasRequiredRole('admin', ['admin'])).toBe(true)
      expect(hasRequiredRole('user', ['user', 'admin'])).toBe(true)
    })

    test('should reject when user lacks required role', () => {
      expect(hasRequiredRole('user', ['admin'])).toBe(false)
    })

    test('should get permissions for a role', () => {
      const adminPerms = getRolePermissions('admin')
      expect(adminPerms).toContain('read:all')
      expect(adminPerms).toContain('manage:users')
    })
  })

  describe('Token Payload Validation', () => {
    test('should validate correct token payload', () => {
      const validPayload = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }

      expect(isValidTokenPayload(validPayload)).toBe(true)
    })

    test('should reject payload with missing fields', () => {
      expect(isValidTokenPayload({ sub: 'user-123' })).toBe(false)
      expect(isValidTokenPayload({})).toBe(false)
    })

    test('should reject null or undefined payload', () => {
      expect(isValidTokenPayload(null)).toBe(false)
      expect(isValidTokenPayload(undefined)).toBe(false)
    })
  })

  describe('Authentication Errors', () => {
    test('should have defined error responses', () => {
      expect(AuthErrors.MISSING_TOKEN.status).toBe(401)
      expect(AuthErrors.FORBIDDEN.status).toBe(403)
    })
  })
})
