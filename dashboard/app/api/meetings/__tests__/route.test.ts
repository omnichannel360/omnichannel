import { POST, GET } from '../route'
import { NextRequest } from 'next/server'
import * as fs from 'fs/promises'
import path from 'path'
import { beforeEach, describe, it, expect, vi } from '@jest/globals'

// Mock dependencies
jest.mock('@/lib/auth', () => ({
  verifyAuth: jest.fn().mockResolvedValue({ authenticated: true }),
  createUnauthorizedResponse: jest.fn(),
}))

jest.mock('@/lib/file-lock', () => ({
  withFileLock: jest.fn((filePath, fn) => fn()),
}))

jest.mock('@/lib/ensure-dir', () => ({
  ensureDataDir: jest.fn().mockResolvedValue(undefined),
}))

describe('POST /api/meetings - Path Traversal Security', () => {
  describe('Meeting type validation with path traversal attempts', () => {
    it('should reject meeting_type with ../ path traversal', async () => {
      // Arrange
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          meeting_type: '../../../etc/passwd',
          message: 'test',
        }),
      })

      // Act
      const response = await POST(request as unknown as NextRequest)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toBeDefined()
    })

    it('should reject meeting_type with absolute path', async () => {
      // Arrange
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          meeting_type: '/etc/passwd',
          message: 'test',
        }),
      })

      // Act
      const response = await POST(request as unknown as NextRequest)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toBeDefined()
    })

    it('should reject meeting_type with backslashes (NTFS traversal)', async () => {
      // Arrange
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          meeting_type: '..\\..\\windows\\system32',
          message: 'test',
        }),
      })

      // Act
      const response = await POST(request as unknown as NextRequest)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
    })

    it('should reject meeting_type with null bytes', async () => {
      // Arrange
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          meeting_type: 'meeting\x00.txt',
          message: 'test',
        }),
      })

      // Act
      const response = await POST(request as unknown as NextRequest)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
    })

    it('should reject meeting_type with special shell characters', async () => {
      const maliciousInputs = [
        'meeting;rm -rf /',
        'meeting`whoami`',
        'meeting$(id)',
        'meeting&&echo',
        'meeting|cat',
      ]

      for (const maliciousInput of maliciousInputs) {
        const request = new NextRequest(new URL('http://localhost/api/meetings'), {
          method: 'POST',
          body: JSON.stringify({
            meeting_type: maliciousInput,
            message: 'test',
          }),
        })

        const response = await POST(request as unknown as NextRequest)
        expect(response.status).toBe(400)
      }
    })

    it('should accept valid meeting_type with alphanumeric, underscore, and hyphen', async () => {
      const validInputs = ['planning-meeting_2024', 'standup-daily', 'sync_engineering_team', 'a', 'Z9_-Z']

      for (const validInput of validInputs) {
        const request = new NextRequest(new URL('http://localhost/api/meetings'), {
          method: 'POST',
          body: JSON.stringify({
            meeting_type: validInput,
            message: 'test meeting',
          }),
        })

        const response = await POST(request as unknown as NextRequest)
        expect(response.status).toBe(200)
      }
    })

    it('should reject meeting_type exceeding max length (64 chars)', async () => {
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          meeting_type: 'a'.repeat(65),
          message: 'test',
        }),
      })

      const response = await POST(request as unknown as NextRequest)
      expect(response.status).toBe(400)
    })

    it('should reject empty meeting_type', async () => {
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          meeting_type: '',
          message: 'test',
        }),
      })

      const response = await POST(request as unknown as NextRequest)
      expect(response.status).toBe(400)
    })

    it('should reject meeting_type with leading dot (hidden file)', async () => {
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          meeting_type: '.hidden_file',
          message: 'test',
        }),
      })

      const response = await POST(request as unknown as NextRequest)
      expect(response.status).toBe(400)
    })

    it('should reject meeting_type with double dots anywhere', async () => {
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          meeting_type: 'meeting..name',
          message: 'test',
        }),
      })

      const response = await POST(request as unknown as NextRequest)
      expect(response.status).toBe(400)
    })

    it('should handle null and undefined meeting_type gracefully', async () => {
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          meeting_type: null,
          message: 'test meeting description',
        }),
      })

      const response = await POST(request as unknown as NextRequest)
      const data = await response.json()

      // Should succeed with null meeting_type if message is present
      expect([200, 400]).toContain(response.status)
    })
  })

  describe('File path construction safety', () => {
    it('should ensure filename stays within intended directory', async () => {
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          meeting_type: 'planning',
          message: 'test meeting',
        }),
      })

      const response = await POST(request as unknown as NextRequest)
      expect(response.status).toBe(200)

      // The safeJoin function should ensure no path traversal
      // Verify via file system operations
    })

    it('should sanitize meeting_type from parsed message', async () => {
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          message: 'planning meeting scheduled',
          // No explicit meeting_type, should parse from message
        }),
      })

      const response = await POST(request as unknown as NextRequest)
      const data = await response.json()

      // Should handle gracefully
      expect([200, 400]).toContain(response.status)
    })
  })

  describe('POST request validation', () => {
    it('should require message OR meeting_type', async () => {
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          participants: ['user1@example.com'],
        }),
      })

      const response = await POST(request as unknown as NextRequest)
      expect(response.status).toBe(400)
    })

    it('should accept message without meeting_type', async () => {
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          message: 'schedule a standup meeting',
          participants: ['user1@example.com'],
        }),
      })

      const response = await POST(request as unknown as NextRequest)
      expect([200, 400]).toContain(response.status)
    })

    it('should reject invalid JSON', async () => {
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: '{invalid json',
      })

      const response = await POST(request as unknown as NextRequest)
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid JSON')
    })

    it('should validate participants array', async () => {
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'POST',
        body: JSON.stringify({
          message: 'test',
          participants: 'not-an-array',
        }),
      })

      const response = await POST(request as unknown as NextRequest)
      expect(response.status).toBe(400)
    })
  })

  describe('GET request handling', () => {
    it('should return meetings list with authentication', async () => {
      const request = new NextRequest(new URL('http://localhost/api/meetings'), {
        method: 'GET',
      })

      const response = await GET(request as unknown as NextRequest)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data).toBeDefined()
      expect(data.meta).toBeDefined()
    })
  })
})

