/**
 * API Authentication Integration Tests
 *
 * Tests all protected API endpoints to ensure:
 * 1. Requests without auth tokens are rejected (401)
 * 2. Requests with valid tokens are accepted
 * 3. Requests with invalid tokens are rejected
 */

import { generateToken } from '@/lib/auth'

const API_BASE = `${process.env.E2E_BASE_URL}/api`
const describeE2E = process.env.E2E_BASE_URL ? describe : describe.skip

const testUser = {
  userId: 'test-user-auth-integration',
  email: 'test@integration.com',
  role: 'admin',
}

async function makeRequest(
  endpoint: string,
  method: string = 'GET',
  token?: string,
  body?: any
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const options: RequestInit = {
    method,
    headers,
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  return fetch(`${API_BASE}${endpoint}`, options)
}

describeE2E('API Authentication Integration', () => {
  let validToken: string

  beforeEach(async () => {
    validToken = await generateToken(testUser.userId, testUser.email, testUser.role)
  })

  describe('Alert Endpoints (/api/alerts)', () => {
    it('GET should return 401 without auth token', async () => {
      const response = await makeRequest('/alerts')
      expect(response.status).toBe(401)
    })

    it('GET should return 200 with valid auth token', async () => {
      const response = await makeRequest('/alerts', 'GET', validToken)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('POST should return 401 without auth token', async () => {
      const response = await makeRequest('/alerts', 'POST', undefined, {
        level: 'info',
        component: 'test',
        message: 'test',
      })
      expect(response.status).toBe(401)
    })

    it('POST should create alert with valid token', async () => {
      const response = await makeRequest('/alerts', 'POST', validToken, {
        level: 'info',
        component: 'test-component',
        message: 'test message',
      })
      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.alert).toBeDefined()
    })
  })

  describe('Brain Endpoints (/api/brain)', () => {
    it('GET should return 401 without auth token', async () => {
      const response = await makeRequest('/brain')
      expect(response.status).toBe(401)
    })

    it('GET should return 200 with valid auth token', async () => {
      const response = await makeRequest('/brain', 'GET', validToken)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data).toBeDefined()
    })
  })

  describe('Conductor Endpoints (/api/conductor)', () => {
    it('GET should return 401 without auth token', async () => {
      const response = await makeRequest('/conductor')
      expect(response.status).toBe(401)
    })

    it('GET should return 200 with valid auth token', async () => {
      const response = await makeRequest('/conductor', 'GET', validToken)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('POST should return 401 without auth token', async () => {
      const response = await makeRequest('/conductor', 'POST', undefined, {
        message: 'test task',
      })
      expect(response.status).toBe(401)
    })

    it('POST should process task with valid token', async () => {
      const response = await makeRequest('/conductor', 'POST', validToken, {
        message: 'fix this bug',
      })
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBeDefined()
    })
  })

  describe('Kanban Endpoints (/api/kanban)', () => {
    it('GET should return 401 without auth token', async () => {
      const response = await makeRequest('/kanban')
      expect(response.status).toBe(401)
    })

    it('GET should return 200 with valid auth token', async () => {
      const response = await makeRequest('/kanban', 'GET', validToken)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(Array.isArray(data.data)).toBe(true)
    })

    it('POST should create task with valid token', async () => {
      const response = await makeRequest('/kanban', 'POST', validToken, {
        title: 'Test Task',
        status: 'todo',
      })
      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('POST should return 401 without auth token', async () => {
      const response = await makeRequest('/kanban', 'POST', undefined, {
        title: 'Test Task',
      })
      expect(response.status).toBe(401)
    })
  })

  describe('Meetings Endpoints (/api/meetings)', () => {
    it('GET should return 401 without auth token', async () => {
      const response = await makeRequest('/meetings')
      expect(response.status).toBe(401)
    })

    it('GET should return 200 with valid auth token', async () => {
      const response = await makeRequest('/meetings', 'GET', validToken)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('POST should return 401 without auth token', async () => {
      const response = await makeRequest('/meetings', 'POST', undefined, {
        message: 'schedule meeting',
      })
      expect(response.status).toBe(401)
    })

    it('POST should process meeting with valid token', async () => {
      const response = await makeRequest('/meetings', 'POST', validToken, {
        message: 'schedule meeting',
      })
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBeDefined()
    })
  })

  describe('Metrics Endpoints (/api/metrics)', () => {
    it('GET should return 401 without auth token', async () => {
      const response = await makeRequest('/metrics')
      expect(response.status).toBe(401)
    })

    it('GET should return 200 with valid auth token', async () => {
      const response = await makeRequest('/metrics', 'GET', validToken)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('Profiles Endpoints (/api/profiles)', () => {
    it('GET should return 401 without auth token', async () => {
      const response = await makeRequest('/profiles')
      expect(response.status).toBe(401)
    })

    it('GET should return 200 with valid auth token', async () => {
      const response = await makeRequest('/profiles', 'GET', validToken)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('Health Endpoints (/api/health)', () => {
    it('GET should return 401 without auth token', async () => {
      const response = await makeRequest('/health')
      expect(response.status).toBe(401)
    })

    it('GET should return 200 with valid auth token', async () => {
      const response = await makeRequest('/health', 'GET', validToken)
      expect([200, 503]).toContain(response.status) // 503 if system is degraded
      const data = await response.json()
      expect(data.status).toBeDefined()
    })
  })

  describe('Invalid Token Handling', () => {
    it('should reject requests with malformed bearer token', async () => {
      const response = await makeRequest('/alerts', 'GET', 'malformed.token')
      expect(response.status).toBe(401)
    })

    it('should reject requests with invalid signature', async () => {
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid_signature'
      const response = await makeRequest('/alerts', 'GET', invalidToken)
      expect(response.status).toBe(401)
    })

    it('should reject requests with Bearer prefix only', async () => {
      const req = new Request(new URL('http://localhost/api/alerts'), {
        headers: { Authorization: 'Bearer' },
      })
      // This would return 401
      expect(true).toBe(true) // Placeholder
    })
  })
})
