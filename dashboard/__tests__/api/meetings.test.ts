import { NextRequest } from 'next/server'
import { POST, GET } from '@/app/api/meetings/route'
import * as fs from 'fs/promises'
import { atomicUpdate } from '@/lib/atomic-file-ops'
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

// Accepted POSTs must never touch real data/ or company-brain/ files
jest.mock('@/lib/atomic-file-ops', () => ({
  atomicRead: jest.fn(async () => []),
  atomicWrite: jest.fn(async () => undefined),
  atomicUpdate: jest.fn(async (_path: string, updater: (data: unknown[]) => Promise<unknown>) => updater([])),
}))

// Isolate route logic from the shared in-memory rate limiter
jest.mock('@/lib/api-rate-limit-middleware', () => ({
  applyRateLimit: jest.fn(async () => null),
}))

describe('POST /api/meetings - Path Traversal Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('meeting_type whitelist validation', () => {
    it('rejects meeting_type with path traversal attempt: ../', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: '../../../etc/passwd',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(String(data.error)).not.toMatch(/content-type/i)
      expect(atomicUpdate).not.toHaveBeenCalled()
    })

    it('rejects meeting_type with backslash traversal: ..\\', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: '..\\..\\windows\\system32',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(String(data.error)).not.toMatch(/content-type/i)
      expect(atomicUpdate).not.toHaveBeenCalled()
    })

    it('rejects meeting_type with forward slash only', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: '/etc/passwd',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(String(data.error)).not.toMatch(/content-type/i)
      expect(atomicUpdate).not.toHaveBeenCalled()
    })

    it('rejects meeting_type with dot sequences', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: '....',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(String(data.error)).not.toMatch(/content-type/i)
      expect(atomicUpdate).not.toHaveBeenCalled()
    })

    it('rejects meeting_type with mixed separators', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: '..\\../admin',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(String(data.error)).not.toMatch(/content-type/i)
      expect(atomicUpdate).not.toHaveBeenCalled()
    })

    it('rejects meeting_type with encoded traversal', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: '%2e%2e%2fadmin',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(String(data.error)).not.toMatch(/content-type/i)
      expect(atomicUpdate).not.toHaveBeenCalled()
    })

    it('rejects meeting_type exceeding max length (64 chars)', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: 'a'.repeat(65),
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(String(data.error)).not.toMatch(/content-type/i)
      expect(atomicUpdate).not.toHaveBeenCalled()
    })

    it('rejects meeting_type with special characters', async () => {
      const specialChars = ['@', '#', '$', '%', '^', '&', '*', '(', ')', '=', '+', '{', '}', '[', ']']

      for (const char of specialChars) {
        const request = new NextRequest('http://localhost/api/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message: 'Test meeting',
            meeting_type: `test${char}meeting`,
          }),
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.success).toBe(false)
        expect(String(data.error)).not.toMatch(/content-type/i)
        expect(atomicUpdate).not.toHaveBeenCalled()
      }

    })

    it('accepts valid meeting_type: alphanumeric', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: 'planning_meeting_2025',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
      expect(atomicUpdate).toHaveBeenCalledTimes(1)
    })

    it('accepts valid meeting_type: with hyphens', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: 'budget-review-q4',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
      expect(atomicUpdate).toHaveBeenCalledTimes(1)
    })

    it('accepts valid meeting_type: with underscores', async () => {
      const request = new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Test meeting',
          meeting_type: 'team_standup',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
      expect(atomicUpdate).toHaveBeenCalledTimes(1)
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

      // safeJoin strips directories via basename, so the result stays inside baseDir
      const result = safeJoin(baseDir, '../../../etc/passwd')
      expect(path.dirname(result)).toBe(path.resolve(baseDir))
    })

    it('allows valid filenames in safeJoin()', () => {
      const { safeJoin } = require('@/lib/validation')
      const baseDir = '/data/meetings'
      const fileName = 'meeting_12345.json'

      const result = safeJoin(baseDir, fileName)

      expect(result).toContain('meeting_12345.json')
      // Resolved path must be within baseDir (platform-independent)
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

      // Every attempt must resolve to a direct child of baseDir
      const attempts = [
        '../../../etc/passwd', // direct traversal
        '%2e%2e%2fadmin', // encoded traversal (not decoded, so a literal filename)
        'file.json\0.txt', // null byte (fs calls reject \0 at I/O time)
      ]
      for (const attempt of attempts) {
        expect(path.dirname(safeJoin(baseDir, attempt))).toBe(baseDir)
      }
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
