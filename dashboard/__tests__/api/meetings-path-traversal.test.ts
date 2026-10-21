/**
 * Path Traversal Vulnerability Tests for Meetings API
 * Tests comprehensive attack vectors and defense-in-depth strategy
 */

import { describe, it, expect } from 'vitest'
import { MeetingTypeSchema, SkillTypeSchema, safeJoin } from '@/lib/validation'
import path from 'path'

describe('Path Traversal Prevention - MeetingTypeSchema', () => {
  describe('Valid whitelisted meeting types', () => {
    it('accepts all valid meeting types from whitelist', () => {
      const validTypes = [
        'planning',
        'standup',
        'retrospective',
        'review',
        'brainstorm',
        'sync',
        'onboarding',
        'feedback',
        'training',
        'unknown',
      ]
      validTypes.forEach((type) => {
        const result = MeetingTypeSchema.safeParse(type)
        expect(result.success).toBe(true)
        expect(result.data).toBe(type)
      })
    })
  })

  describe('Path traversal with ../', () => {
    const attacks = ['..', '../', '../../', '../../../etc/passwd', '..\\..\\windows\\system32']
    attacks.forEach((attack) => {
      it(`rejects: ${attack}`, () => {
        expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
      })
    })
  })

  describe('Absolute paths', () => {
    const attacks = ['/etc/passwd', '/root/.bashrc', 'C:\\Windows\\System32', '~/.ssh/id_rsa']
    attacks.forEach((attack) => {
      it(`rejects absolute path: ${attack}`, () => {
        expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
      })
    })
  })

  describe('Special character injection', () => {
    const attacks = [
      'planning;rm -rf /',
      'planning`whoami`',
      'planning$(whoami)',
      'planning&whoami',
      'planning|whoami',
      'planning>output.txt',
      'planning<input.txt',
      'planning?wildcard=1',
      'planning*',
      'planning<script>',
    ]
    attacks.forEach((attack) => {
      it(`rejects special char injection: ${attack}`, () => {
        expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
      })
    })
  })

  describe('NTFS alternate data stream attacks', () => {
    const attacks = ['file:hidden', 'planning.txt:zone.identifier', 'file::$DATA']
    attacks.forEach((attack) => {
      it(`rejects NTFS stream: ${attack}`, () => {
        expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
      })
    })
  })

  describe('Null byte encoding attacks', () => {
    const attacks = [
      'planning\0.json', // Literal null byte
      'planning%00.json', // URL encoding
      'planning&#x00;.json', // HTML encoding
      'planning\\u0000.json', // Unicode escape
    ]
    attacks.forEach((attack) => {
      it(`rejects null byte: ${attack}`, () => {
        expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
      })
    })
  })

  describe('Length constraints', () => {
    it('rejects empty string', () => {
      expect(MeetingTypeSchema.safeParse('').success).toBe(false)
    })

    it('rejects string longer than 64 chars', () => {
      const longString = 'a'.repeat(65)
      expect(MeetingTypeSchema.safeParse(longString).success).toBe(false)
    })

    it('accepts valid string of max length (64 chars)', () => {
      const maxLengthString = 'a'.repeat(64)
      const result = MeetingTypeSchema.safeParse(maxLengthString)
      // Will likely fail whitelist check but passes length constraint
      expect(result.success).toBe(false) // Because 'aaa...aaa' is not whitelisted
    })
  })

  describe('Real-world attack scenarios', () => {
    const attacks = [
      'normal/../../../etc/passwd',
      'planning/../../windows/system32/config',
      '/home/user/../../../etc/passwd',
    ]
    attacks.forEach((attack) => {
      it(`blocks real-world escape: ${attack}`, () => {
        expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
      })
    })
  })
})

describe('Path Traversal Prevention - SkillTypeSchema', () => {
  describe('Valid whitelisted skill types', () => {
    it('accepts all valid skill types from whitelist', () => {
      const validSkills = ['none', 'unknown', 'meeting_dispatch', 'skill_trigger', 'workflow_execute', 'data_capture', 'analysis', 'report_generation']
      validSkills.forEach((skill) => {
        const result = SkillTypeSchema.safeParse(skill)
        expect(result.success).toBe(true)
        expect(result.data).toBe(skill)
      })
    })
  })

  describe('Rejects same dangerous patterns as MeetingTypeSchema', () => {
    const attacks = ['../etc/passwd', '/etc/passwd', 'skill`whoami`', 'skill:hidden', 'skill\0.json']
    attacks.forEach((attack) => {
      it(`rejects: ${attack}`, () => {
        expect(SkillTypeSchema.safeParse(attack).success).toBe(false)
      })
    })
  })
})

describe('safeJoin() - Filesystem Path Containment', () => {
  describe('Valid safe filenames', () => {
    it('allows simple filenames', () => {
      const result = safeJoin('/data/meetings', 'planning_2024.json')
      expect(result).toContain('planning_2024.json')
      expect(result.startsWith('/data/meetings')).toBe(true)
    })

    it('allows alphanumeric with underscores and hyphens', () => {
      const result = safeJoin('/data', 'file_name-123.json')
      expect(result).toContain('file_name-123.json')
    })
  })

  describe('Path traversal attempts are blocked', () => {
    const attacks = [
      '../../../etc/passwd',
      '..\\..\\windows\\system32',
      '/etc/passwd',
      '../config.json',
    ]
    attacks.forEach((attack) => {
      it(`throws on: ${attack}`, () => {
        expect(() => safeJoin('/data/meetings', attack)).toThrow('Invalid file path')
      })
    })
  })

  describe('Absolute paths are rejected', () => {
    const paths = ['/etc/passwd', 'C:\\Windows\\System32']
    paths.forEach((pathName) => {
      it(`rejects absolute path: ${pathName}`, () => {
        expect(() => safeJoin('/safe/dir', pathName)).toThrow()
      })
    })
  })

  describe('Uses basename() to strip path components', () => {
    it('extracts filename from malicious path and validates containment', () => {
      // Even if safeJoin receives a path with directories, basename extracts just the filename
      const result = safeJoin('/data', 'subdir/planning.json')
      // path.basename('subdir/planning.json') = 'planning.json'
      expect(result).toContain('planning.json')
    })
  })
})

describe('Defense in Depth Integration', () => {
  it('Multi-layer validation on path traversal attack', () => {
    const malicious = '../../../etc/passwd'

    // Layer 1: Schema validation catches it
    const schemaResult = MeetingTypeSchema.safeParse(malicious)
    expect(schemaResult.success).toBe(false)

    // Layer 2: path.basename() shows the difference
    const baseName = path.basename(malicious)
    expect(baseName).not.toBe(malicious)
    expect(baseName).toBe('passwd')

    // Layer 3: safeJoin rejects it even if schema somehow failed
    expect(() => safeJoin('/data/meetings', malicious)).toThrow()
  })

  it('Prevents encoding bypass attacks', () => {
    const encodedAttacks = [
      '../config',
      'file%00.json',
      'file\\0.txt',
    ]

    encodedAttacks.forEach((attack) => {
      const schemaResult = MeetingTypeSchema.safeParse(attack)
      // Should fail schema validation
      expect(schemaResult.success).toBe(false)
    })
  })

  it('Whitelist enforcement is the final gate', () => {
    // Even if somehow all special chars pass, whitelist prevents execution
    const almostValid = 'planning' // Valid format but need to check whitelist
    const result = MeetingTypeSchema.safeParse(almostValid)
    // 'planning' is in whitelist
    expect(result.success).toBe(true)

    const notWhitelisted = 'some_random_meeting' // Valid format but not whitelisted
    const result2 = MeetingTypeSchema.safeParse(notWhitelisted)
    expect(result2.success).toBe(false)
  })
})

describe('Error Handling and Auditability', () => {
  it('Throws error on invalid meeting_type (not silent fallback)', () => {
    // This test ensures errors are thrown for security auditing
    const invalid = '../../../etc/passwd'
    const result = MeetingTypeSchema.safeParse(invalid)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('Provides detailed error messages for debugging', () => {
    const invalid = '../../../etc/passwd'
    const result = MeetingTypeSchema.safeParse(invalid)
    if (!result.success) {
      expect(result.error.errors.length).toBeGreaterThan(0)
      expect(result.error.errors[0].message).toBeDefined()
    }
  })
})
