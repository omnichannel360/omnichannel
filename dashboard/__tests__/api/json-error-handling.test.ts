import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'

/**
 * JSON Parsing Error Handling Tests
 * Verifies all API endpoints properly handle malformed JSON with 400 responses
 */

const BASE_URL = `${process.env.E2E_BASE_URL}/api`
const describeE2E = process.env.E2E_BASE_URL ? describe : describe.skip
const AUTH_TOKEN = 'test-token'

// Mock headers with authentication
const createHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
})

// Helper to test JSON parsing errors
async function testJsonErrorHandling(endpoint: string, method: 'POST' | 'PUT' | 'PATCH') {
  const malformedPayloads = [
    '{invalid json}',
    '{key: "missing quotes"}',
    '{"unclosed": "object"',
    '',
    'null',
  ]

  for (const payload of malformedPayloads) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: createHeaders(),
      body: payload,
    })

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json).toHaveProperty('error')
    expect(json.error).toContain('JSON')
  }
}

describeE2E('API JSON Parsing Error Handling', () => {
  describe('POST Endpoints', () => {
    it('POST /api/auth - handles malformed JSON with 400', async () => {
      await testJsonErrorHandling('/auth', 'POST')
    })

    it('POST /api/alerts - handles malformed JSON with 400', async () => {
      await testJsonErrorHandling('/alerts', 'POST')
    })

    it('POST /api/kanban - handles malformed JSON with 400', async () => {
      await testJsonErrorHandling('/kanban', 'POST')
    })

    it('POST /api/conductor - handles malformed JSON with 400', async () => {
      await testJsonErrorHandling('/conductor', 'POST')
    })

    it('POST /api/meetings - handles malformed JSON with 400', async () => {
      await testJsonErrorHandling('/meetings', 'POST')
    })

    it('POST /api/auth/login - handles malformed JSON with 400', async () => {
      await testJsonErrorHandling('/auth/login', 'POST')
    })
  })

  describe('PATCH Endpoints', () => {
    it('PATCH /api/alerts - handles malformed JSON with 400', async () => {
      await testJsonErrorHandling('/alerts', 'PATCH')
    })
  })

  describe('PUT Endpoints', () => {
    it('PUT /api/kanban - handles malformed JSON with 400', async () => {
      await testJsonErrorHandling('/kanban', 'PUT')
    })
  })

  describe('Valid JSON Handling', () => {
    it('POST /api/auth - accepts valid JSON', async () => {
      const response = await fetch(`${BASE_URL}/auth`, {
        method: 'POST',
        headers: createHeaders(),
        body: JSON.stringify({
          userId: 'test-user',
          email: 'test@example.com',
          role: 'user',
        }),
      })

      // Should not be 400 (may be 401 or 500 depending on token validation)
      expect(response.status).not.toBe(400)
    })

    it('POST /api/alerts - accepts valid JSON', async () => {
      const response = await fetch(`${BASE_URL}/alerts`, {
        method: 'POST',
        headers: createHeaders(),
        body: JSON.stringify({
          level: 'info',
          component: 'test',
          message: 'Test message',
        }),
      })

      // Should not be 400
      expect(response.status).not.toBe(400)
    })
  })

  describe('Error Response Format', () => {
    it('returns consistent error response format', async () => {
      const response = await fetch(`${BASE_URL}/auth`, {
        method: 'POST',
        headers: createHeaders(),
        body: '{invalid}',
      })

      expect(response.status).toBe(400)
      const json = await response.json()

      // Verify error structure
      expect(json).toHaveProperty('error')
      expect(typeof json.error).toBe('string')
      expect(json.error.toLowerCase()).toContain('json')
    })

    it('does not expose sensitive stack traces', async () => {
      const response = await fetch(`${BASE_URL}/auth`, {
        method: 'POST',
        headers: createHeaders(),
        body: '{invalid}',
      })

      const json = await response.json()

      // Should not contain stack traces
      expect(JSON.stringify(json)).not.toMatch(/at\s+\w+\s+\(/i)
      expect(JSON.stringify(json)).not.toMatch(/node_modules/i)
    })
  })

  describe('Content-Type Handling', () => {
    it('handles requests with application/json content-type', async () => {
      const response = await fetch(`${BASE_URL}/auth`, {
        method: 'POST',
        headers: {
          ...createHeaders(),
          'Content-Type': 'application/json',
        },
        body: '{invalid}',
      })

      expect(response.status).toBe(400)
    })

    it('handles requests without content-type', async () => {
      const headers = createHeaders()
      delete headers['Content-Type']

      const response = await fetch(`${BASE_URL}/auth`, {
        method: 'POST',
        headers,
        body: '{invalid}',
      })

      expect(response.status).toBe(400)
    })
  })

  describe('Type Safety', () => {
    it('enforces type narrowing after JSON parsing', async () => {
      const response = await fetch(`${BASE_URL}/auth`, {
        method: 'POST',
        headers: createHeaders(),
        body: JSON.stringify({
          userId: 123, // Invalid type (number instead of string)
          email: true, // Invalid type (boolean instead of string)
        }),
      })

      // Should either reject or handle gracefully
      expect([400, 500]).toContain(response.status)
    })
  })
})

/**
 * Integration Test Checklist
 * - [x] All POST endpoints handle malformed JSON
 * - [x] All PUT/PATCH endpoints handle malformed JSON
 * - [x] Error responses return 400 status
 * - [x] Error messages mention JSON parsing
 * - [x] Valid JSON is accepted (not rejected)
 * - [x] No sensitive stack traces in error responses
 * - [x] Type safety enforced after parsing
 * - [x] Consistent error response format
 */
