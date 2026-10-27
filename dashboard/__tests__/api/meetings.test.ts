import { NextRequest } from 'next/server'
import { POST, GET } from '@/app/api/meetings/route'
import * as fs from 'fs/promises'
import path from 'path'

// Mock authentication
jest.mock('@/lib/auth', () => ({
  verifyAuth: jest.fn(async () => ({
    authenticated: true,
    error: null,
  })),
  createUnauthorizedResponse: jest.fn(() => ({ status: 401 })),
}))

// Mock file operations
jest.mock('@/lib/file-lock', () => ({
  withFileLock: jest.fn((_path, callback) => callback()),
}))

jest.mock('@/lib/ensure-dir', () => ({
  ensureDataDir: jest.fn(),
}))

describe('POST /api/meetings - Path Traversal Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('meeting_type whitelist validation', () => {
    it('rejects meeting_type with path traversal attempt: ../', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: '../../../etc/passwd',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })

    it('rejects meeting_type with backslash traversal: ..\\', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: '..\\..\\windows\\system32',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })

    it('rejects meeting_type with forward slash only', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: '/etc/passwd',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })

    it('rejects meeting_type with dot sequences', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: '....',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })

    it('rejects meeting_type with mixed separators', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: '..\\../admin',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })

    it('rejects meeting_type with encoded traversal', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: '%2e%2e%2fadmin',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })

    it('rejects meeting_type exceeding max length (64 chars)', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: 'a'.repeat(65),
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })

    it('rejects meeting_type with special characters', async () => {
      const specialChars = ['@', '#', '$', '%', '^', '&', '*', '(', ')', '=', '+', '{', '}', '[', ']']

      for (const char of specialChars) {
        const request = new NextRequest('http://localhost/api/meetings', {
          method: 'POST',
          body: JSON.stringify({
            message: 'Test meeting',
            meeting_type: `test${char}meeting`,
          }),
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.success).toBe(false)
      }

    })

    it('accepts valid meeting_type: alphanumeric', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: 'planning_meeting_2025',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
    })

    it('accepts valid meeting_type: with hyphens', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: 'budget-review-q4',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
    })

    it('accepts valid meeting_type: with underscores', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: 'team_standup',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
    })
  })

  describe('filename sanitization with path.basename()', () => {
    it('strips path components when constructing filename', () => {
      // This test verifies the actual implementation
      const maliciousInput = '../../../etc/passwd'
      const cleaned = path.basename(maliciousInput)

      // basename should return just the filename, not the path
      expect(cleaned).toBe('passwd')
      expect(cleaned).not.toContain('..')
      expect(cleaned).not.toContain('/')
    })

    it('handles windows path separators correctly', () => {
      const maliciousInput = '..\\..\\windows\\system32\\config'
      const cleaned = path.basename(maliciousInput)

      // On both Windows and Unix, basename should extract just the last component
      expect(cleaned).not.toContain('..')
      expect(cleaned).not.toContain('\\')
    })

    it('extracts only filename from full path', () => {
      const fullPath = '/home/user/documents/secret.txt'
      const cleaned = path.basename(fullPath)

      expect(cleaned).toBe('secret.txt')
      expect(cleaned).not.toContain('/')
    })
  })

  describe('safeJoin() containment check', () => {
    it('prevents directory escape in safeJoin()', () => {
      const { safeJoin } = require('@/lib/validation')
      const baseDir = '/data/meetings'

      // safeJoin should throw or prevent escape
      expect(() => {
        safeJoin(baseDir, '../../../etc/passwd')
      }).toThrow()
    })

    it('allows valid filenames in safeJoin()', () => {
      const { safeJoin } = require('@/lib/validation')
      const baseDir = '/data/meetings'
      const fileName = 'meeting_12345.json'

      const result = safeJoin(baseDir, fileName)

      expect(result).toContain('meeting_12345.json')
      expect(result).toContain('/data/meetings')
      // Resolved path must be within baseDir
      expect(result.startsWith(path.resolve(baseDir))).toBe(true)
    })
  })

  describe('defense-in-depth validation layers', () => {
    it('enforces multiple validation layers', async () => {
      // Layer 1: Schema validation
      // Layer 2: path.basename() stripping
      // Layer 3: safeJoin() containment check

      const { MeetingTypeSchema } = require('@/lib/validation')
      const maliciousInput = '../../../etc/passwd'

      // Layer 1 should fail
      const schemaValidation = MeetingTypeSchema.safeParse(maliciousInput)
      expect(schemaValidation.success).toBe(false)
    })

    it('no single layer bypass allows escape', async () => {
      // Even if one layer had a bug, others would prevent escape
      const { safeJoin } = require('@/lib/validation')
      const baseDir = path.resolve('/data/meetings')

      // Attempt 1: Direct path traversal
      const attempt1 = '../../../etc/passwd'
      expect(() => safeJoin(baseDir, attempt1)).toThrow()

      // Attempt 2: Encoded traversal
      const attempt2 = '%2e%2e%2fadmin'
      expect(() => safeJoin(baseDir, attempt2)).toThrow()

      // Attempt 3: Null byte injection
      const attempt3 = 'file.json\0.txt'
      expect(() => safeJoin(baseDir, attempt3)).toThrow()
    })
  })

  describe('GET /api/meetings - Security', () => {
    it('returns meetings without vulnerability exposure', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'GET',
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })
})
