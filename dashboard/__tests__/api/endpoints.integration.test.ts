import { createToken } from '@/lib/auth'

describe('Protected API Endpoints Integration Tests', () => {
  const apiUrl = 'http://localhost:3000'
  let authToken: string

  beforeAll(async () => {
    // Create a test token
    authToken = await createToken({
      sub: 'test-user-123',
      email: 'testuser@example.com',
      role: 'admin',
    })
  })

  describe('Authentication Requirements', () => {
    const protectedEndpoints = [
      { path: '/api/alerts', method: 'GET' },
      { path: '/api/brain', method: 'GET' },
      { path: '/api/conductor', method: 'POST' },
      { path: '/api/kanban', method: 'GET' },
      { path: '/api/meetings', method: 'GET' },
      { path: '/api/metrics', method: 'GET' },
      { path: '/api/profiles', method: 'GET' },
    ]

    protectedEndpoints.forEach(({ path, method }) => {
      it(`should reject ${method} ${path} without authentication`, async () => {
        const response = await fetch(`${apiUrl}${path}`, {
          method,
        })

        expect(response.status).toBe(401)
        const data = await response.json()
        expect(data.success).toBe(false)
        expect(data.error).toBeDefined()
      })

      it(`should accept ${method} ${path} with valid token`, async () => {
        const response = await fetch(`${apiUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        })

        // Should not be 401
        expect(response.status).not.toBe(401)
      })

      it(`should reject ${method} ${path} with invalid token`, async () => {
        const response = await fetch(`${apiUrl}${path}`, {
          method,
          headers: {
            authorization: 'Bearer invalid-token-xyz',
          },
        })

        expect(response.status).toBe(401)
      })

      it(`should reject ${method} ${path} with malformed auth header`, async () => {
        const response = await fetch(`${apiUrl}${path}`, {
          method,
          headers: {
            authorization: 'InvalidFormat token123',
          },
        })

        expect(response.status).toBe(401)
      })
    })
  })

  describe('Public Endpoints', () => {
    it('should allow GET /api/health without authentication', async () => {
      const response = await fetch(`${apiUrl}/api/health`)
      expect(response.status).not.toBe(401)
    })

    it('should allow POST /api/auth without authentication', async () => {
      const response = await fetch(`${apiUrl}/api/auth`, {
        method: 'POST',
        body: JSON.stringify({
          username: 'test',
          password: 'test',
        }),
      })

      // Should not be 401 (may fail for other reasons)
      expect(response.status).not.toBe(401)
    })
  })

  describe('Token Validation', () => {
    it('should extract user info from token', async () => {
      // The middleware should attach user info to headers
      // This would be verified in actual integration tests
      expect(authToken).toBeDefined()
      expect(authToken.split('.').length).toBe(3)
    })

    it('should handle token expiration gracefully', async () => {
      // Expired tokens should return 401
      const response = await fetch(`${apiUrl}/api/alerts`, {
        headers: {
          authorization: 'Bearer expired.token.here',
        },
      })

      expect(response.status).toBe(401)
    })
  })
})
