/**
 * Path Traversal Vulnerability Tests for Meetings API
 */

import { MeetingTypeSchema, SkillTypeSchema, safeJoin, generateId } from '@/lib/validation'
import path from 'path'

describe('Path Traversal Vulnerability - Validation Layer', () => {
  describe('MeetingTypeSchema validation', () => {
    it('accepts valid meeting types', () => {
      const validTypes = ['planning', 'standup', 'retrospective', 'review']
      validTypes.forEach((type) => {
        const result = MeetingTypeSchema.safeParse(type)
        expect(result.success).toBe(true)
      })
    })

    it('rejects path traversal with ../', () => {
      const result = MeetingTypeSchema.safeParse('../../../etc/passwd')
      expect(result.success).toBe(false)
    })

    it('rejects absolute paths', () => {
      const result = MeetingTypeSchema.safeParse('/etc/passwd')
      expect(result.success).toBe(false)
    })

    it('rejects null bytes', () => {
      const result = MeetingTypeSchema.safeParse("planning\0.json")
      expect(result.success).toBe(false)
    })

    it('rejects backslash traversal', () => {
      const result = MeetingTypeSchema.safeParse('planning\\..\\other')
      expect(result.success).toBe(false)
    })

    it('rejects shell commands', () => {
      const result = MeetingTypeSchema.safeParse('planning`whoami`')
      expect(result.success).toBe(false)
    })
  })
})

describe('Path Traversal Vulnerability - Filesystem Defense', () => {
  describe('safeJoin() containment validation', () => {
    it('accepts safe filenames', () => {
      const baseDir = '/data/meetings'
      const fileName = 'planning_meeting_2024.json'
      const result = safeJoin(baseDir, fileName)
      expect(result).toContain('planning_meeting_2024.json')
    })

    it('rejects path traversal attempts', () => {
      const baseDir = '/data/meetings'
      const fileName = '../../../etc/passwd'
      expect(() => safeJoin(baseDir, fileName)).toThrow()
    })

    it('rejects absolute paths', () => {
      const baseDir = '/data/meetings'
      const fileName = '/etc/passwd'
      expect(() => safeJoin(baseDir, fileName)).toThrow()
    })
  })
})

describe('Path Traversal Attack Vectors', () => {
  const attacks = [
    '../../../etc/passwd',
    'planning/../../other',
    '/etc/passwd',
    'C:\\Windows\\System32',
    '$HOME/private',
    'planning|cat',
    'planning`whoami`',
  ]

  attacks.forEach((input) => {
    it(`blocks: ${input}`, () => {
      const result = MeetingTypeSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })
})

describe('Defense in Depth Verification', () => {
  it('validates with multiple security layers', () => {
    const input = '../../../etc/passwd'
    
    // Layer 1: Schema validation
    expect(MeetingTypeSchema.safeParse(input).success).toBe(false)
    
    // Layer 2: path.basename() defense
    expect(path.basename(input)).not.toBe(input)
    
    // Layer 3: safeJoin containment
    expect(() => safeJoin('/safe', input)).toThrow()
  })
})
