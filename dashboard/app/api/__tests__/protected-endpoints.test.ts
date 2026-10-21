import { generateToken } from '@/lib/auth'

describe('Protected API Endpoints', () => {
  let validToken: string
  let expiredToken: string

  beforeAll(async () => {
    // Valid token for 1 hour
    validToken = await generateToken('test-user', 'test@example.com', 'user', 3600)
    // Expired token
    expiredToken = await generateToken('test-user', 'test@example.com', 'user', -1)
  })

  describe('GET /api/alerts', () => {
    test('should return 401 without authentication', async () => {
      const response = await fetch('/api/alerts')
      expect(response.status).toBe(401)
    })

    test('should return 401 with invalid token', async () => {
      const response = await fetch('/api/alerts', {
        headers: { 'Authorization': 'Bearer invalid-token' },
      })
      expect(response.status).toBe(401)
    })

    test('should return 401 with expired token', async () => {
      const response = await fetch('/api/alerts', {
        headers: { 'Authorization': `Bearer ${expiredToken}` },
      })
      expect(response.status).toBe(401)
    })

    test('should return 200 with valid token', async () => {
      const response = await fetch('/api/alerts', {
        headers: { 'Authorization': `Bearer ${validToken}` },
      })
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('alerts')
      expect(Array.isArray(data.alerts)).toBe(true)
    })
  })

  describe('GET /api/brain', () => {
    test('should return 401 without authentication', async () => {
      const response = await fetch('/api/brain')
      expect(response.status).toBe(401)
    })

    test('should return 200 with valid token', async () => {
      const response = await fetch('/api/brain', {
        headers: { 'Authorization': `Bearer ${validToken}` },
      })
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('data')
    })
  })

  describe('GET /api/kanban', () => {
    test('should return 401 without authentication', async () => {
      const response = await fetch('/api/kanban')
      expect(response.status).toBe(401)
    })

    test('should return 200 with valid token', async () => {
      const response = await fetch('/api/kanban', {
        headers: { 'Authorization': `Bearer ${validToken}` },
      })
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('data')
    })
  })

  describe('POST endpoints', () => {
    test('POST /api/alerts should require authentication', async () => {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        body: JSON.stringify({ level: 'info', component: 'test', message: 'test' }),
      })
      expect(response.status).toBe(401)
    })

    test('POST /api/conductor should require authentication', async () => {
      const response = await fetch('/api/conductor', {
        method: 'POST',
        body: JSON.stringify({ message: 'test message' }),
      })
      expect(response.status).toBe(401)
    })

    test('POST /api/meetings should require authentication', async () => {
      const response = await fetch('/api/meetings', {
        method: 'POST',
        body: JSON.stringify({ message: 'test meeting' }),
      })
      expect(response.status).toBe(401)
    })
  })

  describe('PUT/DELETE endpoints', () => {
    test('PUT /api/kanban should require authentication', async () => {
      const response = await fetch('/api/kanban', {
        method: 'PUT',
        body: JSON.stringify({ id: '1', title: 'Updated' }),
      })
      expect(response.status).toBe(401)
    })

    test('DELETE /api/kanban should require authentication', async () => {
      const response = await fetch('/api/kanban?id=1', {
        method: 'DELETE',
      })
      expect(response.status).toBe(401)
    })
  })
})
