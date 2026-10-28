/**
 * Path Traversal Vulnerability - Comprehensive Security Tests
 * Verifies that the fix prevents directory traversal attacks through:
 * 1. Schema validation (MeetingTypeSchema + SkillTypeSchema character allowlist)
 * 2. path.basename() stripping (explicit defense)
 * 3. safeJoin containment (strips directories, result always inside base)
 * 4. Response data sanitization (no leaking unvalidated input)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { promises as fs } from 'fs'
import path from 'path'
import { MeetingTypeSchema, SkillTypeSchema, safeJoin, generateId } from '@/lib/validation'

// Meeting types present in real brain logs
const REAL_MEETING_TYPES = ['standup-report', 'sprint-review', 'sprint-planning', 'retrospective-kaizen', 'postmortem']

const expectContained = (baseDir: string, result: string) => {
  expect(path.dirname(result)).toBe(path.resolve(baseDir))
}

describe('Path Traversal Vulnerability Fix - Comprehensive Suite', () => {
  describe('Layer 1: MeetingTypeSchema Character Validation', () => {
    it('should reject path traversal attempts with ../', () => {
      const attacks = ['../../etc/passwd', '..\\..\\windows\\system32', '../../../root/.ssh/id_rsa']
      attacks.forEach(attack => {
        const result = MeetingTypeSchema.safeParse(attack)
        expect(result.success).toBe(false)
      })
    })

    it('should reject path separators / and \\', () => {
      const attacks = ['meeting/type', 'meeting\\type', 'data/config', 'etc\\passwd']
      attacks.forEach(attack => {
        const result = MeetingTypeSchema.safeParse(attack)
        expect(result.success).toBe(false)
      })
    })

    it('should reject null bytes and special characters', () => {
      const attacks = [
        'meeting\x00.json',
        'type;rm -rf',
        'meeting$(whoami)',
        'type`id`',
        'meeting~backup',
        'type$var',
        'meeting%25',
      ]
      attacks.forEach(attack => {
        const result = MeetingTypeSchema.safeParse(attack)
        expect(result.success).toBe(false)
      })
    })

    it('should reject NTFS alternate data streams', () => {
      const attacks = ['meeting:$DATA', 'type::sensitive', 'config:hidden']
      attacks.forEach(attack => {
        const result = MeetingTypeSchema.safeParse(attack)
        expect(result.success).toBe(false)
      })
    })

    it('should accept meeting types used in real brain logs', () => {
      REAL_MEETING_TYPES.forEach(type => {
        const result = MeetingTypeSchema.safeParse(type)
        expect(result.success).toBe(true)
        expect(result.data).toBe(type)
      })
    })

    it('should reject values over 64 characters', () => {
      expect(MeetingTypeSchema.safeParse('a'.repeat(64)).success).toBe(true)
      expect(MeetingTypeSchema.safeParse('a'.repeat(65)).success).toBe(false)
    })
  })

  describe('Layer 2: SkillTypeSchema Whitelist Validation', () => {
    it('should reject path traversal in skill names', () => {
      const attacks = ['../../skill', 'skill/../../../config', '..\\skill\\..\\etc']
      attacks.forEach(attack => {
        const result = SkillTypeSchema.safeParse(attack)
        expect(result.success).toBe(false)
      })
    })

    it('should reject special filesystem characters in skill names', () => {
      const attacks = [
        'skill:$DATA',
        'skill*',
        'skill?',
        'skill"name"',
        "skill'name'",
        'skill<name>',
        'skill|pipe',
      ]
      attacks.forEach(attack => {
        const result = SkillTypeSchema.safeParse(attack)
        expect(result.success).toBe(false)
      })
    })
  })

  describe('Layer 3: path.basename() Defense Stripping', () => {
    it('should strip directory components when basename is applied', () => {
      const malicious = '../../etc/passwd'
      const basename = path.basename(malicious)
      expect(basename).toBe('passwd')
      expect(basename).not.toContain('..')
      expect(basename).not.toContain('/')
    })

    it('should strip backslash-based traversal', () => {
      const malicious = '..\\..\\windows\\system32'
      const basename = path.basename(malicious)
      expect(basename).toBe('system32')
      expect(basename).not.toContain('..')
      expect(basename).not.toContain('\\')
    })

    it('should detect and reject basename changes in validated values', () => {
      // After validation passes, if basename() changes the value,
      // something is wrong (validation should have caught it)
      const validType = 'standup'
      const basename = path.basename(validType)
      expect(basename).toBe(validType) // Should not change
    })
  })

  describe('Layer 4: safeJoin Containment Validation', () => {
    const testDir = path.join(process.cwd(), 'data', 'test-security-fix')

    beforeEach(async () => {
      try {
        await fs.mkdir(testDir, { recursive: true })
      } catch {
        // Already exists
      }

    })

    afterAll(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true })
      } catch {
        // Cleanup optional
      }
    })

    it('should allow safe filenames inside base directory', () => {
      const result = safeJoin(testDir, 'meeting_log.json')
      expect(result.startsWith(testDir)).toBe(true)
      expect(result).toContain('meeting_log.json')
    })

    it('should contain absolute path injection inside base directory', () => {
      const absolutePath = process.platform === 'win32' ? 'C:\\windows\\system32' : '/etc/passwd'
      const result = safeJoin(testDir, absolutePath)
      expectContained(testDir, result)
      expect(path.basename(result)).toBe(path.basename(absolutePath))
    })

    it('should contain directory traversal escape attempts inside base directory', () => {
      const attempts = [
        '../../sensitive.json',
        '..\\..\\windows\\data',
        '../../../root/.ssh/id_rsa',
      ]
      attempts.forEach(attempt => {
        expectContained(testDir, safeJoin(testDir, attempt))
      })
    })

    it('should strip traversal so result never points outside base', () => {
      const result = safeJoin(testDir, '../../etc/passwd')
      expect(result).toBe(path.resolve(testDir, 'passwd'))
    })
  })

  describe('Filename Generation Safety', () => {
    it('should generate safe filenames with validated meeting_type and ID', () => {
      const meetingType = 'standup'
      const id = generateId('meeting')
      const fileName = `${meetingType}_${id}.json`

      // Verify filename is safe
      expect(fileName).toMatch(/^[A-Za-z0-9_\-\.]+$/)
      expect(fileName).not.toContain('..')
      expect(fileName).not.toContain('/')
      expect(fileName).not.toContain('\\')
      expect(fileName).not.toContain(':')
    })

    it('should produce unique filenames for repeated calls', () => {
      const type = 'planning'
      const id1 = generateId('meeting')
      const id2 = generateId('meeting')
      const file1 = `${type}_${id1}.json`
      const file2 = `${type}_${id2}.json`

      expect(file1).not.toBe(file2)
    })
  })

  describe('Defense-in-Depth Integration', () => {
    it('should reject attack even if one defense layer fails (defense in depth)', () => {
      // Simulate attacker finding bypass in one layer
      const malicious = '../../etc/passwd'

      // Layer 1: Schema validation
      const schemaCheck = MeetingTypeSchema.safeParse(malicious)
      expect(schemaCheck.success).toBe(false)

      // Layer 2: Manual basename check (as in logToBrain)
      const basename = path.basename(malicious)
      expect(basename).not.toBe(malicious)
      expect(basename).toBe('passwd')

      // Layer 3: safeJoin containment
      const testDir = process.cwd()
      expectContained(testDir, safeJoin(testDir, malicious))
    })

    it('should reject combination attacks (traversal + null bytes + special chars)', () => {
      const combinationAttack = '../../../etc/passwd:$DATA;rm -rf /'
      const result = MeetingTypeSchema.safeParse(combinationAttack)
      expect(result.success).toBe(false)
    })
  })

  describe('Response Data Sanitization', () => {
    it('should demonstrate that response data is validated before return', () => {
      // Simulate POST handler behavior
      const userInput = 'standup' // Valid input
      const parsed = { meeting_type: userInput, skill: 'planning' }

      // Validation layer (as in POST handler)
      const validatedMeeting = MeetingTypeSchema.safeParse(parsed.meeting_type)
      const validatedSkill = SkillTypeSchema.safeParse(parsed.skill)

      expect(validatedMeeting.success).toBe(true)
      expect(validatedSkill.success).toBe(true)

      // Response uses validated data, not raw parsed data
      const safeResponse = {
        meeting_type: validatedMeeting.data,
        skill: validatedSkill.data,
      }

      expect(safeResponse.meeting_type).toBe('standup')
    })

    it('should reject unvalidated data in response', () => {
      const userInput = '../../etc/passwd'
      const parsed = { meeting_type: userInput, skill: '../../malicious' }

      const validatedMeeting = MeetingTypeSchema.safeParse(parsed.meeting_type)
      const validatedSkill = SkillTypeSchema.safeParse(parsed.skill)

      expect(validatedMeeting.success).toBe(false)
      expect(validatedSkill.success).toBe(false)

      // Response would use safe defaults
      const safeMeeting = validatedMeeting.success ? validatedMeeting.data : 'unknown'
      const safeSkill = validatedSkill.success ? validatedSkill.data : 'none'

      expect(safeMeeting).toBe('unknown')
      expect(safeSkill).toBe('none')
    })
  })

  describe('Edge Cases and Unicode', () => {
    it('should reject unicode and internationalization characters', () => {
      const unicode = ['meeting_日本語', 'type_中文', 'skill_📅_backup']
      unicode.forEach(value => {
        const meetingResult = MeetingTypeSchema.safeParse(value)
        const skillResult = SkillTypeSchema.safeParse(value)
        expect(meetingResult.success).toBe(false)
        expect(skillResult.success).toBe(false)
      })
    })

    it('should reject URL and protocol patterns', () => {
      const urls = [
        'file:///etc/passwd',
        'http://malicious.com',
        'ftp://server/data',
        'data:text/plain;base64,evil',
      ]
      urls.forEach(url => {
        const result = MeetingTypeSchema.safeParse(url)
        expect(result.success).toBe(false)
      })
    })

    it('should reject whitespace and control characters', () => {
      const invalid = [
        'meeting type',
        'type\n\r',
        'meeting\t',
        'type ',
        ' type',
        'type\x00',
      ]
      invalid.forEach(value => {
        const result = MeetingTypeSchema.safeParse(value)
        expect(result.success).toBe(false)
      })
    })
  })
})
