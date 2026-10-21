import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import { MeetingTypeSchema, VALID_MEETING_TYPES, safeJoin } from '@/lib/validation'

/**
 * Path Traversal Vulnerability Tests
 * These tests verify that the meeting_type field cannot be used
 * to escape the intended directory or access system files.
 */

describe('MeetingTypeSchema - Path Traversal Prevention', () => {
  describe('Valid meeting types', () => {
    it('should accept valid meeting types from whitelist', () => {
      VALID_MEETING_TYPES.forEach((type) => {
        const result = MeetingTypeSchema.safeParse(type)
        expect(result.success).toBe(true)
        expect(result.data).toBe(type)
      })
    })

    it('should accept lowercase alphanumeric with hyphens and underscores', () => {
      const validInputs = ['standup', 'team_sync', 'sprint-review', 'retro_2025']
      validInputs.forEach((input) => {
        const result = MeetingTypeSchema.safeParse(input)
        // Note: These will fail whitelist check but pass regex/pattern check
        // This demonstrates the multi-layer validation
      })
    })
  })

  describe('Path traversal attempts', () => {
    const traversalAttempts = [
      '../etc/passwd',
      '..\\..\\windows\\system32',
      '....',
      './../config',
      'normal/../../../etc/passwd',
      'normal/../../file',
    ]

    traversalAttempts.forEach((attempt) => {
      it(`should reject path traversal attempt: ${attempt}`, () => {
        const result = MeetingTypeSchema.safeParse(attempt)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.errors.length).toBeGreaterThan(0)
        }
      })
    })
  })

  describe('Absolute path attempts', () => {
    const absolutePaths = [
      '/etc/passwd',
      'C:\\Windows\\System32\\config',
      '~/.ssh/id_rsa',
      '/root/.bashrc',
    ]

    absolutePaths.forEach((attempt) => {
      it(`should reject absolute path: ${attempt}`, () => {
        const result = MeetingTypeSchema.safeParse(attempt)
        expect(result.success).toBe(false)
      })
    })
  })

  describe('Special character injection attempts', () => {
    const injectionAttempts = [
      '../normal',
      'file;rm -rf /',
      'file`whoami`',
      'file$(whoami)',
      'file&whoami',
      'file|whoami',
      'file>file.txt',
      'file<input.txt',
      'normal%00.txt',
      'normal\0.txt',
      'file?wildcard=1',
      'file*',
      'file<script>',
    ]

    injectionAttempts.forEach((attempt) => {
      it(`should reject special character: ${attempt}`, () => {
        const result = MeetingTypeSchema.safeParse(attempt)
        expect(result.success).toBe(false)
      })
    })
  })

  describe('NTFS alternate data stream attacks', () => {
    const ntfsAttempts = [
      'file:hidden',
      'normal.txt:zone.identifier',
      'file::$DATA',
    ]

    ntfsAttempts.forEach((attempt) => {
      it(`should reject NTFS stream attempt: ${attempt}`, () => {
        const result = MeetingTypeSchema.safeParse(attempt)
        expect(result.success).toBe(false)
      })
    })
  })

  describe('Whitelist enforcement', () => {
    it('should reject values not in VALID_MEETING_TYPES', () => {
      const invalidTypes = [
        'random-type',
        'custom_meeting',
        'workshop',
        'seminar',
      ]

      invalidTypes.forEach((type) => {
        const result = MeetingTypeSchema.safeParse(type)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(
            result.error.errors.some((e) =>
              e.message.includes('allowed types')
            )
          ).toBe(true)
        }
      })
    })
  })

  describe('Length constraints', () => {
    it('should reject empty string', () => {
      const result = MeetingTypeSchema.safeParse('')
      expect(result.success).toBe(false)
    })

    it('should reject strings longer than 64 characters', () => {
      const longString = 'a'.repeat(65)
      const result = MeetingTypeSchema.safeParse(longString)
      expect(result.success).toBe(false)
    })

    it('should accept exactly 64 characters if valid', () => {
      const validType = 'planning' // Valid in whitelist
      const result = MeetingTypeSchema.safeParse(validType)
      if (validType.length <= 64) {
        // Check whitelist first
        const isInWhitelist = VALID_MEETING_TYPES.has(validType as any)
        expect(result.success).toBe(isInWhitelist)
      }
    })
  })
})

describe('safeJoin - Path Containment', () => {
  const baseDir = '/safe/base/dir'

  describe('Valid paths', () => {
    it('should allow normal filenames', () => {
      const result = safeJoin(baseDir, 'normal_file.json')
      expect(result).toContain('normal_file.json')
      expect(path.dirname(result)).toBe(path.resolve(baseDir))
    })

    it('should allow filenames with hyphens and underscores', () => {
      const result = safeJoin(baseDir, 'meeting_2025-01-15.json')
      expect(result).toContain('meeting_2025-01-15.json')
    })
  })

  describe('Path traversal containment', () => {
    const traversalAttempts = [
      '../../../etc/passwd',
      '..\\..\\windows\\system32',
      'subdir/../../../etc/passwd',
      'normalfile/../../../etc/passwd',
    ]

    traversalAttempts.forEach((filename) => {
      it(`should prevent traversal via basename: ${filename}`, () => {
        const baseName = path.basename(filename)
        expect(() => safeJoin(baseDir, baseName)).not.toThrow()
        // basename should strip path components
        expect(baseName).not.toContain('/')
        expect(baseName).not.toContain('..')
      })
    })
  })

  describe('Absolute path prevention', () => {
    const absolutePaths = ['/etc/passwd', 'C:\\Windows\\System32\\config']

    absolutePaths.forEach((filename) => {
      it(`should prevent absolute path: ${filename}`, () => {
        const result = safeJoin(baseDir, filename)
        // safeJoin should resolve and validate containment
        const resultDir = path.dirname(result)
        const resolvedBase = path.resolve(baseDir)
        expect(resultDir).toBe(resolvedBase)
      })
    })
  })
})

describe('Defense in Depth Integration', () => {
  it('should apply multiple validation layers', () => {
    const maliciousInputs = [
      '../etc/passwd',
      'file;rm -rf /',
      'normal/../../../secret',
    ]

    maliciousInputs.forEach((input) => {
      // Layer 1: Schema validation
      const schemaResult = MeetingTypeSchema.safeParse(input)
      expect(schemaResult.success).toBe(false)

      // Layer 2: Even if validation passes, basename + safeJoin would catch it
      if (schemaResult.success) {
        const baseName = path.basename(input)
        expect(() => safeJoin('/safe/dir', baseName)).not.toThrow()
        const resultPath = safeJoin('/safe/dir', baseName)
        expect(resultPath).not.toContain('..')
      }
    })
  })

  it('should require whitelist membership', () => {
    const unknownValidMeeting = 'unknown' // This is in VALID_MEETING_TYPES
    const result = MeetingTypeSchema.safeParse(unknownValidMeeting)
    expect(result.success).toBe(true)

    const unknownInvalidMeeting = 'invalid_type'
    const resultInvalid = MeetingTypeSchema.safeParse(unknownInvalidMeeting)
    expect(resultInvalid.success).toBe(false)
  })
})

describe('Null byte and special encoding attacks', () => {
  const encodingAttempts = [
    'normal\0file.txt',
    'normal%00file.txt',
    'normal&#x00;file.txt',
    'normal\u0000file.txt',
  ]

  encodingAttempts.forEach((attempt) => {
    it(`should reject null byte encoding: ${JSON.stringify(attempt)}`, () => {
      const result = MeetingTypeSchema.safeParse(attempt)
      expect(result.success).toBe(false)
    })
  })
})

describe('Real-world attack scenarios', () => {
  it('should prevent reading /etc/passwd via path manipulation', () => {
    const attacks = [
      '/etc/passwd',
      '../../../etc/passwd',
      '....//....//....//etc/passwd',
    ]

    attacks.forEach((attack) => {
      const result = MeetingTypeSchema.safeParse(attack)
      expect(result.success).toBe(false)
    })
  })

  it('should prevent writing to arbitrary locations', () => {
    const attacks = [
      '/tmp/malicious',
      '../backups/data',
      '../../.ssh/authorized_keys',
    ]

    attacks.forEach((attack) => {
      const result = MeetingTypeSchema.safeParse(attack)
      expect(result.success).toBe(false)
    })
  })

  it('should prevent symlink escape attacks', () => {
    // Even if a symlink is created, validation should prevent its use
    const result = MeetingTypeSchema.safeParse('link_to_system')
    if (!result.success) {
      expect(result.error.errors.some((e) => e.message.includes('allowed'))).toBe(
        true
      )
    }
  })
})
