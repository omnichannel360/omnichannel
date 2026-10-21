import { NextRequest } from 'next/server'
import { POST as alertsPost, PATCH as alertsPatch } from '@/app/api/alerts/route'
import { POST as kanbanPost, PUT as kanbanPut } from '@/app/api/kanban/route'
import { POST as conductorPost } from '@/app/api/conductor/route'

// Mock auth verification
jest.mock('@/lib/auth', () => ({
  verifyAuth: jest.fn(() => Promise.resolve({ authenticated: true })),
  createUnauthorizedResponse: jest.fn((msg) => new Response(JSON.stringify({ error: msg }), { status: 401 })),
}))

// Mock file system
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(() => Promise.resolve()),
    stat: jest.fn(() => Promise.reject(new Error('ENOENT'))),
    writeFile: jest.fn(() => Promise.resolve()),
    readFile: jest.fn(() => Promise.resolve('[]')),
    access: jest.fn(() => Promise.reject(new Error('ENOENT'))),
  },
}))

describe('JSON Parsing Error Handling', () => {
  describe('Alerts API - POST /api/alerts', () => {
    it('should return 400 on malformed JSON', async () => {
      const request = new NextRequest('http://localhost/api/alerts', {
        method: 'POST',
        body: '{invalid json',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test',
        },
      })

      const response = await alertsPost(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid JSON in request body')
    })

    it('should return 400 on missing required fields', async () => {
      const request = new NextRequest('http://localhost/api/alerts', {
        method: 'POST',
        body: JSON.stringify({ level: 'info' }),
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test',
        },
      })

      const response = await alertsPost(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid request')
    })

    it('should return 400 on invalid enum value', async () => {
      const request = new NextRequest('http://localhost/api/alerts', {
        method: 'POST',
        body: JSON.stringify({
          level: 'invalid-level',
          component: 'test',
          message: 'test',
        }),
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test',
        },
      })

      const response = await alertsPost(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.success).toBe(false)
    })
  })

  describe('Kanban API - POST /api/kanban', () => {
    it('should return 400 on malformed JSON', async () => {
      const request = new NextRequest('http://localhost/api/kanban', {
        method: 'POST',
        body: '{broken json',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test',
        },
      })

      const response = await kanbanPost(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('Invalid JSON in request body')
    })

    it('should return 400 on missing title', async () => {
      const request = new NextRequest('http://localhost/api/kanban', {
        method: 'POST',
        body: JSON.stringify({ status: 'todo' }),
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test',
        },
      })

      const response = await kanbanPost(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should return 400 on invalid status enum', async () => {
      const request = new NextRequest('http://localhost/api/kanban', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Task',
          status: 'invalid-status',
        }),
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test',
        },
      })

      const response = await kanbanPost(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.success).toBe(false)
    })
  })

  describe('Conductor API - POST /api/conductor', () => {
    it('should return 400 on malformed JSON', async () => {
      const request = new NextRequest('http://localhost/api/conductor', {
        method: 'POST',
        body: '{invalid',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test',
        },
      })

      const response = await conductorPost(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('Invalid JSON in request body')
    })

    it('should return 400 on missing message', async () => {
      const request = new NextRequest('http://localhost/api/conductor', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test',
        },
      })

      const response = await conductorPost(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should return 400 on non-string message', async () => {
      const request = new NextRequest('http://localhost/api/conductor', {
        method: 'POST',
        body: JSON.stringify({ message: 123 }),
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer test',
        },
      })

      const response = await conductorPost(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.success).toBe(false)
    })
  })
})
