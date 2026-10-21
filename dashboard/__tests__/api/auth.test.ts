import { verifyAuth, generateToken, createUnauthorizedResponse } from '@/lib/auth'

/**
 * JWT Authentication Test Suite
 * Tests all authentication flows and edge cases
 */

describe('JWT Authentication System', () => {
  const testUserId = 'test-user-123'
  const testEmail = 'test@example.com'
  const testRole = 'user'

  describe('Token Generation', () => {
    test('should generate valid JWT token', async () => {
      const token = await generateToken(testUserId, testEmail, testRole)
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
    })

    test('should generate token with admin role', async () => {
      const token = await generateToken(testUserId, testEmail, 'admin')
      expect(token).toBeDefined()
    })
  })

  describe('Token Verification', () => {
    test('should verify valid token successfully', async () => {
      const token = await generateToken(testUserId, testEmail, testRole)
      const mockRequest = createMockRequest(token)
      
      const result = await verifyAuth(mockRequest as any)
      
      expect(result.authenticated).toBe(true)
      expect(result.payload).toBeDefined()
      expect(result.payload?.sub).toBe(testUserId)
      expect(result.payload?.email).toBe(testEmail)
    })

    test('should reject missing authorization header', async () => {
      const mockRequest = createMockRequest(null)
      
      const result = await verifyAuth(mockRequest as any)
      
      expect(result.authenticated).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('Error Responses', () => {
    test('should create 401 unauthorized response', () => {
      const response = createUnauthorizedResponse('Test error message')
      
      expect(response.status).toBe(401)
    })
  })

  describe('Route Protection', () => {
    test('without token should return 401', async () => {
      const mockRequest = createMockRequest(null)
      const result = await verifyAuth(mockRequest as any)
      
      expect(result.authenticated).toBe(false)
    })

    test('with valid token should proceed', async () => {
      const token = await generateToken(testUserId, testEmail, testRole)
      const mockRequest = createMockRequest(token)
      
      const result = await verifyAuth(mockRequest as any)
      
      expect(result.authenticated).toBe(true)
    })
  })
})

function createMockRequest(authHeader: string | null) {
  return {
    headers: {
      get: (key: string) => {
        if (key.toLowerCase() === 'authorization') {
          return authHeader
        }
        return null
      },
    },
    url: 'http://localhost:3000/api/test',
  }
}
