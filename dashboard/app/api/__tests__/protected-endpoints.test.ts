import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals'
import { generateToken } from '@/lib/auth'

describe('Protected API Endpoints', () => {
  let validToken: string
  let expiredToken: string
  let mockFetch: jest.Mock

  beforeEach(async () => {
    // ARRANGE: Generate fresh tokens for each test
    validToken = await generateToken('test-user', 'test@example.com', 'user', 3600)
    expiredToken = await generateToken('test-user', 'test@example.com', 'user', -1)

    // Mock fetch for API calls
    mockFetch = jest.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    // CLEANUP: Reset mocks and restore original fetch
    jest.resetAllMocks()
    delete (global as unknown as any).fetch
  })

  describe('GET /api/alerts', () => {
    it('should return 401 without authentication', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })

      // Act
      const response = await fetch('/api/alerts')

      // Assert
      expect(response.status).toBe(401)
      expect(mockFetch).toHaveBeenCalledWith('/api/alerts', expect.any(Object))
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should return 401 with invalid token', async () => {
      // Arrange
      const invalidToken = 'Bearer invalid-token'
      mockFetch.mockResolvedValueOnce({
        status: 401,
        json: async () => ({ error: 'Invalid token' }),
      })

      // Act
      const response = await fetch('/api/alerts', {
        headers: { 'Authorization': invalidToken },
      })

      // Assert
      expect(response.status).toBe(401)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/alerts',
        expect.objectContaining({
          headers: expect.objectContaining({ 'Authorization': invalidToken }),
        })
      )
    })

    it('should return 401 with expired token', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        status: 401,
        json: async () => ({ error: 'Token expired' }),
      })

      // Act
      const response = await fetch('/api/alerts', {
        headers: { 'Authorization': `Bearer ${expiredToken}` },
      })

      // Assert
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty('error')
    })

    it('should return 200 with valid token', async () => {
      // Arrange
      const mockAlertsData = {
        success: true,
        alerts: [
          { id: '1', level: 'info', component: 'test', message: 'Test alert' },
        ],
      }
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockAlertsData,
      })

      // Act
      const response = await fetch('/api/alerts', {
        headers: { 'Authorization': `Bearer ${validToken}` },
      })

      // Assert
      expect(response.status).toBe(200)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/alerts',
        expect.objectContaining({
          headers: expect.objectContaining({ 'Authorization': expect.stringContaining('Bearer') }),
        })
      )
      const data = await response.json()
      expect(data).toHaveProperty('alerts')
      expect(Array.isArray(data.alerts)).toBe(true)
      expect(data.alerts.length).toBeGreaterThanOrEqual(0)
      if (data.alerts.length > 0) {
        expect(data.alerts[0]).toHaveProperty('id')
        expect(data.alerts[0]).toHaveProperty('level')
        expect(typeof data.alerts[0].id).toBe('string')
      }
    })
  })

  describe('GET /api/brain', () => {
    it('should return 401 without authentication', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })

      // Act
      const response = await fetch('/api/brain')

      // Assert
      expect(response.status).toBe(401)
      expect(mockFetch).toHaveBeenCalledWith('/api/brain', expect.any(Object))
    })

    it('should return 200 with valid token', async () => {
      // Arrange
      const mockBrainData = { success: true, data: { insight: 'test insight' } }
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockBrainData,
      })

      // Act
      const response = await fetch('/api/brain', {
        headers: { 'Authorization': `Bearer ${validToken}` },
      })

      // Assert
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('data')
      expect(typeof data.data).toBe('object')
      expect(data.success).toBe(true)
    })
  })

  describe('GET /api/kanban', () => {
    it('should return 401 without authentication', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })

      // Act
      const response = await fetch('/api/kanban')

      // Assert
      expect(response.status).toBe(401)
    })

    it('should return 200 with valid token', async () => {
      // Arrange
      const mockKanbanData = { success: true, data: { items: [] } }
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => mockKanbanData,
      })

      // Act
      const response = await fetch('/api/kanban', {
        headers: { 'Authorization': `Bearer ${validToken}` },
      })

      // Assert
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('data')
      expect(typeof data.data).toBe('object')
    })
  })

  describe('POST endpoints', () => {
    it('POST /api/alerts should require authentication', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })

      // Act
      const response = await fetch('/api/alerts', {
        method: 'POST',
        body: JSON.stringify({ level: 'info', component: 'test', message: 'test' }),
      })

      // Assert
      expect(response.status).toBe(401)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/alerts',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('POST /api/conductor should require authentication', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })

      // Act
      const response = await fetch('/api/conductor', {
        method: 'POST',
        body: JSON.stringify({ message: 'test message' }),
      })

      // Assert
      expect(response.status).toBe(401)
    })

    it('POST /api/meetings should require authentication', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })

      // Act
      const response = await fetch('/api/meetings', {
        method: 'POST',
        body: JSON.stringify({ message: 'test meeting' }),
      })

      // Assert
      expect(response.status).toBe(401)
    })
  })

  describe('PUT/DELETE endpoints', () => {
    it('PUT /api/kanban should require authentication', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })

      // Act
      const response = await fetch('/api/kanban', {
        method: 'PUT',
        body: JSON.stringify({ id: '1', title: 'Updated' }),
      })

      // Assert
      expect(response.status).toBe(401)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/kanban',
        expect.objectContaining({ method: 'PUT' })
      )
    })

    it('DELETE /api/kanban should require authentication', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })

      // Act
      const response = await fetch('/api/kanban?id=1', {
        method: 'DELETE',
      })

      // Assert
      expect(response.status).toBe(401)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/kanban?id=1',
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })
})
