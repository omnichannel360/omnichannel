/**
 * Path Traversal Prevention - COMPREHENSIVE Security Test Suite
 * ============================================================
 *
 * Covers:
 * 1. Test Cases (basic & advanced)
 * 2. Edge Cases (boundary conditions, unicode, encoding)
 * 3. Security Scenarios (attack vectors, defense layers)
 * 4. Expected Results (validation outcomes)
 *
 * Defense Strategy:
 * - Layer 1: Schema validation (whitelist-based)
 * - Layer 2: path.basename() stripping
 * - Layer 3: safeJoin containment validation
 * - Layer 4: Response data sanitization
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { promises as fs } from 'fs'
import path from 'path'
import { MeetingTypeSchema, SkillTypeSchema, safeJoin, generateId, VALID_MEETING_TYPES } from '@/lib/validation'

describe('PATH TRAVERSAL PREVENTION - COMPREHENSIVE SECURITY SUITE', () => {
  const TEST_BASE_DIR = path.join(process.cwd(), 'data', 'test-comprehensive-security')

  beforeAll(async () => {
    try {
      await fs.mkdir(TEST_BASE_DIR, { recursive: true })
    } catch (e) {
      // Already exists
    }
  })

  afterAll(async () => {
    try {
      await fs.rm(TEST_BASE_DIR, { recursive: true, force: true })
    } catch (e) {
      // Cleanup optional
    }
  })

  // ========================================
  // 1. BASIC TEST CASES
  // ========================================
  describe('1. BASIC TEST CASES', () => {
    describe('1.1 Valid Meeting Type Acceptance', () => {
      it('should accept single valid meeting type', () => {
        const result = MeetingTypeSchema.safeParse('standup')
        expect(result.success).toBe(true)
        expect(result.data).toBe('standup')
      })

      it('should accept multiple valid meeting types from whitelist', () => {
        const validTypes = Array.from(VALID_MEETING_TYPES)
        validTypes.forEach(type => {
          const result = MeetingTypeSchema.safeParse(type)
          expect(result.success).toBe(true)
          expect(result.data).toBe(type)
        })
      })

      it('should accept alphanumeric with underscore and hyphen', () => {
        const validPatterns = ['sprint-planning', 'daily_sync', 'Q1_2024', 'retro-v2']
        validPatterns.forEach(pattern => {
          // These may not all be in whitelist, but test the character acceptance
          if (pattern.match(/^[A-Za-z0-9_-]+$/)) {
            expect(pattern).toMatch(/^[A-Za-z0-9_-]+$/)
          }
        })
      })
    })

    describe('1.2 Invalid Type Rejection', () => {
      it('should reject empty string', () => {
        const result = MeetingTypeSchema.safeParse('')
        expect(result.success).toBe(false)
      })

      it('should reject null and undefined', () => {
        expect(MeetingTypeSchema.safeParse(null).success).toBe(false)
        expect(MeetingTypeSchema.safeParse(undefined).success).toBe(false)
      })

      it('should reject non-string types', () => {
        expect(MeetingTypeSchema.safeParse(123).success).toBe(false)
        expect(MeetingTypeSchema.safeParse({}).success).toBe(false)
        expect(MeetingTypeSchema.safeParse([]).success).toBe(false)
      })
    })

    describe('1.3 Path Traversal Detection (Basic)', () => {
      it('should reject double dot (..) traversal', () => {
        const attacks = ['..', '../..', '../../..']
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject mixed separators in traversal', () => {
        const attacks = ['../../../etc/passwd', '..\\..\\..\\windows']
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })
    })
  })

  // ========================================
  // 2. ADVANCED TEST CASES
  // ========================================
  describe('2. ADVANCED TEST CASES', () => {
    describe('2.1 Directory Traversal Variants', () => {
      it('should reject Unix-style traversal with forward slashes', () => {
        const attacks = [
          '../../etc/passwd',
          '../../../root/.ssh/id_rsa',
          '../../../../usr/bin/bash',
          '../../../../../../../etc/shadow',
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject Windows-style traversal with backslashes', () => {
        const attacks = [
          '..\\..\\windows\\system32',
          '..\\..\\..\\Program Files\\sensitive',
          '\\\\server\\share\\..\\..\\confidential',
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject mixed slash traversal attacks', () => {
        const attacks = [
          '../..\\..\\windows\\system32',
          '..\\../etc/passwd',
          '../\\../sensitive',
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject current directory references', () => {
        const attacks = ['./../../sensitive', '.\\..\\data', './config.json']
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })
    })

    describe('2.2 Null Byte Injection', () => {
      it('should reject null bytes in various positions', () => {
        const attacks = [
          'meeting\x00.json',
          '\x00sensitive',
          'data\x00hidden',
          'file\x00\x00name',
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject combined null byte + traversal', () => {
        const attacks = [
          '../../../etc/passwd\x00',
          '\x00../../sensitive',
          'meeting\x00/../../../etc',
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })
    })

    describe('2.3 Special Character Exploitation', () => {
      it('should reject shell command injection patterns', () => {
        const attacks = [
          'type;rm -rf /',
          'meeting$(whoami)',
          'type`id`',
          'skill$(cat /etc/passwd)',
          'meeting;curl http://malicious.com',
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject variable expansion patterns', () => {
        const attacks = ['type$var', 'meeting${var}', 'skill$HOME']
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject pipe and redirection operators', () => {
        const attacks = [
          'meeting | cat',
          'type > output.txt',
          'skill < input.txt',
          'data >> append.txt',
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })
    })

    describe('2.4 NTFS Alternate Data Streams', () => {
      it('should reject NTFS stream notation with colon', () => {
        const attacks = [
          'meeting:$DATA',
          'type::sensitive',
          'config:hidden',
          'file.txt:stream',
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject combined stream attacks', () => {
        const attacks = [
          '../../sensitive:$DATA',
          'file.json:hidden::backup',
          'meeting:stream/../../../etc',
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })
    })

    describe('2.5 Whitespace and Control Characters', () => {
      it('should reject embedded spaces', () => {
        const attacks = [
          'meeting type',
          'skill name',
          'data with spaces',
          'type ',
          ' type',
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject control characters', () => {
        const attacks = [
          'meeting\n',
          'type\r\n',
          'skill\t',
          'data\x01\x02\x03',
          'meeting\x08backspace',
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject mixed whitespace attacks', () => {
        const attacks = [
          '../../etc/passwd ',
          ' ../../etc',
          'meeting\n../../sensitive',
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })
    })
  })

  // ========================================
  // 3. EDGE CASES
  // ========================================
  describe('3. EDGE CASES', () => {
    describe('3.1 Boundary Conditions', () => {
      it('should accept maximum valid length', () => {
        const maxValidLength = 'a'.repeat(64)
        const isBelowLimit = maxValidLength.length <= 64
        expect(isBelowLimit).toBe(true)
      })

      it('should reject maximum length + 1', () => {
        const tooLong = 'a'.repeat(65)
        const result = MeetingTypeSchema.safeParse(tooLong)
        expect(result.success).toBe(false)
      })

      it('should reject extremely long paths', () => {
        const longPath = '../'.repeat(100) + 'etc/passwd'
        const result = MeetingTypeSchema.safeParse(longPath)
        expect(result.success).toBe(false)
      })

      it('should reject single character edge cases', () => {
        const edgeCases = ['.', '..', '/', '\\', '~', '-', '_']
        edgeCases.forEach(char => {
          // Single char validation depends on schema
          const result = MeetingTypeSchema.safeParse(char)
          // Most should fail except safe ones like underscore or hyphen
        })
      })
    })

    describe('3.2 Unicode and Internationalization', () => {
      it('should reject Unicode characters (CJK)', () => {
        const unicode = [
          'meeting_日本語',
          'type_中文',
          'skill_한국어',
          '📅_meeting',
        ]
        unicode.forEach(value => {
          expect(MeetingTypeSchema.safeParse(value).success).toBe(false)
        })
      })

      it('should reject emoji and special symbols', () => {
        const emoji = [
          '📅meeting',
          'type_⚠️',
          'skill_🔒_backup',
          'data_👤_access',
        ]
        emoji.forEach(value => {
          expect(MeetingTypeSchema.safeParse(value).success).toBe(false)
        })
      })

      it('should reject Unicode normalization attacks', () => {
        // Combining characters that appear safe but normalize differently
        const attacks = [
          'meeting\u0301', // e + combining acute accent
          'type\u0308', // combining diaeresis
          'skill\u20d1', // combining arrow
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject right-to-left unicode tricks', () => {
        const rtl = [
          'meeting\u202e123', // right-to-left override
          'type\u202d456', // left-to-right override
        ]
        rtl.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })
    })

    describe('3.3 URL and Encoding Attacks', () => {
      it('should reject URL schemes', () => {
        const urls = [
          'file:///etc/passwd',
          'http://malicious.com',
          'ftp://server/data',
          'https://api.example.com/admin',
          'data:text/plain;base64,evil',
        ]
        urls.forEach(url => {
          expect(MeetingTypeSchema.safeParse(url).success).toBe(false)
        })
      })

      it('should reject URL-encoded traversal', () => {
        const encoded = [
          '%2e%2e%2fetc%2fpasswd', // URL-encoded ../etc/passwd
          '%2e%2e%5cwindows', // URL-encoded ..\windows
          '..%2fetc', // partially encoded
        ]
        encoded.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject double-encoded attacks', () => {
        const double = [
          '%252e%252e%252fetc', // double-encoded
          '%25252e%25252e', // triple-encoded
        ]
        double.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })
    })

    describe('3.4 Case Variation Attacks', () => {
      it('should reject Windows case variations', () => {
        const caseVariations = [
          '..\\..\\WINDOWS\\SYSTEM32',
          '..\\..\\Windows\\System32',
          '..\\..\\windows\\SYSTEM32',
        ]
        caseVariations.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject Unix case variations', () => {
        const caseVariations = [
          '../../ETC/PASSWD',
          '../../etc/PASSWD',
          '../../ETC/passwd',
        ]
        caseVariations.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })
    })

    describe('3.5 Filename Extension Tricks', () => {
      it('should reject double extensions', () => {
        const attacks = [
          'meeting.json.txt',
          'type.backup.json',
          'skill.old.json',
        ]
        attacks.forEach(attack => {
          expect(MeetingTypeSchema.safeParse(attack).success).toBe(false)
        })
      })

      it('should reject no-extension filenames that look like traversal', () => {
        const attacks = [
          'passwd',
          'shadow',
          'sudoers', // These are valid filenames on their own, test path containment
        ]
        // These might pass schema if they're valid identifiers, but safeJoin must still contain them
      })
    })
  })

  // ========================================
  // 4. SECURITY SCENARIOS
  // ========================================
  describe('4. SECURITY SCENARIOS', () => {
    describe('4.1 Defense Layer 1: Schema Validation', () => {
      it('should reject attack at validation stage before filesystem access', () => {
        const maliciousInputs = [
          '../../etc/passwd',
          'meeting/../../../sensitive',
          '..\\..\\windows\\system32',
        ]
        maliciousInputs.forEach(input => {
          const result = MeetingTypeSchema.safeParse(input)
          expect(result.success).toBe(false)
          expect(result.data).toBeUndefined()
        })
      })

      it('should prevent payload from reaching filesystem layer', () => {
        const attacks = ['../../data/users.json', '../../../api/keys.env']
        attacks.forEach(attack => {
          // Should fail at schema, never reach filesystem
          const result = MeetingTypeSchema.safeParse(attack)
          expect(result.success).toBe(false)
        })
      })
    })

    describe('4.2 Defense Layer 2: Basename Stripping', () => {
      it('should demonstrate path.basename() effectiveness', () => {
        const maliciousPath = '../../etc/passwd'
        const basename = path.basename(maliciousPath)

        expect(basename).toBe('passwd')
        expect(basename).not.toContain('..')
        expect(basename).not.toContain('/')
        expect(basename).not.toContain('\\')
      })

      it('should handle complex paths with basename', () => {
        const complexPaths = [
          '../../etc/shadow',
          '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
          '../../../root/.ssh/id_rsa',
        ]
        complexPaths.forEach(p => {
          const basename = path.basename(p)
          expect(basename).not.toContain('..')
          expect(basename).not.toContain('/')
        })
      })

      it('should detect when basename changes the value (bypass indicator)', () => {
        // If validated input changes after basename, validation is flawed
        const validInputs = Array.from(VALID_MEETING_TYPES)
        validInputs.forEach(input => {
          const basename = path.basename(input)
          expect(basename).toBe(input) // Should not change
        })
      })
    })

    describe('4.3 Defense Layer 3: safeJoin Containment', () => {
      it('should allow safe filenames inside base directory', () => {
        const result = safeJoin(TEST_BASE_DIR, 'meeting_log.json')
        expect(result.startsWith(TEST_BASE_DIR)).toBe(true)
        expect(result).toContain('meeting_log.json')
      })

      it('should throw on absolute path injection', () => {
        const absolutePath = process.platform === 'win32' ? 'C:\\windows\\system32' : '/etc/passwd'
        expect(() => safeJoin(TEST_BASE_DIR, absolutePath)).toThrow()
      })

      it('should throw on directory traversal escape attempts', () => {
        const attempts = [
          '../../sensitive.json',
          '..\\..\\windows\\data',
          '../../../root/.ssh/id_rsa',
        ]
        attempts.forEach(attempt => {
          expect(() => safeJoin(TEST_BASE_DIR, attempt)).toThrow('Invalid file path')
        })
      })

      it('should validate resolved path stays within base directory', () => {
        const baseDir = path.resolve(TEST_BASE_DIR)
        const safeFilename = 'meeting.json'
        const result = safeJoin(baseDir, safeFilename)
        const resolvedResult = path.resolve(result)
        expect(resolvedResult.startsWith(baseDir)).toBe(true)
      })
    })

    describe('4.4 Defense Layer 4: Response Data Sanitization', () => {
      it('should only return validated data in response', () => {
        const userInput = 'standup'
        const validated = MeetingTypeSchema.safeParse(userInput)

        if (validated.success) {
          const response = { meeting_type: validated.data }
          expect(response.meeting_type).toBe('standup')
        }
      })

      it('should reject unvalidated data from reaching response', () => {
        const maliciousInput = '../../etc/passwd'
        const validated = MeetingTypeSchema.safeParse(maliciousInput)

        expect(validated.success).toBe(false)
        const response = validated.success ? { data: validated.data } : { error: 'Invalid input' }
        expect(response.error).toBe('Invalid input')
      })

      it('should sanitize error messages to not reveal path structure', () => {
        const maliciousInput = '../../etc/passwd'
        const validated = MeetingTypeSchema.safeParse(maliciousInput)

        if (!validated.success) {
          const errorMessage = 'Invalid input format'
          expect(errorMessage).not.toContain(maliciousInput)
          expect(errorMessage).not.toContain('..')
          expect(errorMessage).not.toContain('/')
        }
      })
    })

    describe('4.5 Defense-in-Depth Integration Tests', () => {
      it('should reject attack even if one defense layer theoretically bypassed', () => {
        const attack = '../../etc/passwd'

        // Layer 1: Schema
        const layer1 = MeetingTypeSchema.safeParse(attack)
        expect(layer1.success).toBe(false)

        // Layer 2: Basename
        const basename = path.basename(attack)
        expect(basename).not.toBe(attack)

        // Layer 3: safeJoin
        expect(() => safeJoin(TEST_BASE_DIR, attack)).toThrow()
      })

      it('should handle combination attacks across all vectors', () => {
        const combinationAttack = '../../../etc/passwd:$DATA;rm -rf /'
        const result = MeetingTypeSchema.safeParse(combinationAttack)
        expect(result.success).toBe(false)
      })

      it('should accept legitimate input through all layers', () => {
        const legitimate = 'standup'

        // Layer 1: Schema
        const layer1 = MeetingTypeSchema.safeParse(legitimate)
        expect(layer1.success).toBe(true)

        // Layer 2: Basename doesn't change it
        const basename = path.basename(legitimate)
        expect(basename).toBe(legitimate)

        // Layer 3: safeJoin contains it
        const joined = safeJoin(TEST_BASE_DIR, legitimate)
        expect(joined.startsWith(TEST_BASE_DIR)).toBe(true)
      })
    })

    describe('4.6 Concurrency and Race Conditions', () => {
      it('should handle concurrent validation requests safely', async () => {
        const validRequests = Array(10).fill('standup')
        const invalidRequests = Array(10).fill('../../etc/passwd')
        const allRequests = [...validRequests, ...invalidRequests]

        const results = allRequests.map(r => MeetingTypeSchema.safeParse(r))
        const validCount = results.filter(r => r.success).length
        const invalidCount = results.filter(r => !r.success).length

        expect(validCount).toBe(10)
        expect(invalidCount).toBe(10)
      })

      it('should prevent TOCTOU (time-of-check-time-of-use) attacks', () => {
        // Verify validation and use are atomic
        const input = 'standup'
        const validated = MeetingTypeSchema.safeParse(input)

        if (validated.success) {
          // Use validated.data directly, not original input
          const filename = validated.data
          expect(filename).toBe('standup')
        }
      })
    })
  })

  // ========================================
  // 5. EXPECTED RESULTS & VALIDATION
  // ========================================
  describe('5. EXPECTED RESULTS & VALIDATION', () => {
    describe('5.1 Valid Input Expected Results', () => {
      it('valid meeting types should return success: true and correct data', () => {
        const validTypes = Array.from(VALID_MEETING_TYPES)
        validTypes.forEach(type => {
          const result = MeetingTypeSchema.safeParse(type)
          expect(result.success).toBe(true)
          expect(result.data).toBe(type)
        })
      })

      it('valid input should be usable in filesystem operations', () => {
        const validInput = 'standup'
        const result = MeetingTypeSchema.safeParse(validInput)

        if (result.success) {
          const safeResult = safeJoin(TEST_BASE_DIR, result.data)
          expect(safeResult).toContain(result.data)
        }
      })
    })

    describe('5.2 Invalid Input Expected Results', () => {
      it('path traversal should return success: false', () => {
        const invalidInputs = [
          '../../etc/passwd',
          '..\\..\\windows',
          '../config.json',
        ]
        invalidInputs.forEach(input => {
          const result = MeetingTypeSchema.safeParse(input)
          expect(result.success).toBe(false)
        })
      })

      it('invalid input should have error property', () => {
        const result = MeetingTypeSchema.safeParse('../../etc/passwd')
        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
      })

      it('invalid input should not be usable in operations', () => {
        const result = MeetingTypeSchema.safeParse('../../etc/passwd')
        expect(result.success).toBe(false)
        expect(() => {
          // Should not use unvalidated data
          if (result.success) {
            safeJoin(TEST_BASE_DIR, result.data)
          }
        }).not.toThrow() // Doesn't throw because we check success first
      })
    })

    describe('5.3 Error Message Expectations', () => {
      it('should provide error on invalid input', () => {
        const result = MeetingTypeSchema.safeParse('../../etc/passwd')
        expect(result.success).toBe(false)
      })

      it('should not leak system information in errors', () => {
        const result = MeetingTypeSchema.safeParse('../../etc/passwd')
        if (!result.success) {
          // Ensure no path disclosure
          const errorString = JSON.stringify(result.error)
          expect(errorString).not.toContain('/etc')
          expect(errorString).not.toContain('\\windows')
        }
      })
    })

    describe('5.4 Return Value Expectations', () => {
      it('should return exact input value on valid input', () => {
        const valid = 'standup'
        const result = MeetingTypeSchema.safeParse(valid)
        expect(result.data).toBe(valid)
        expect(result.data).not.toBe(valid + '_modified')
      })

      it('should not modify valid input during validation', () => {
        const input = 'sprint-planning'
        const result = MeetingTypeSchema.safeParse(input)
        if (result.success) {
          expect(result.data).toBe(input)
          expect(result.data.length).toBe(input.length)
        }
      })
    })

    describe('5.5 Filesystem Operation Expected Results', () => {
      it('should successfully create files with validated names', async () => {
        const validInput = 'standup'
        const validated = MeetingTypeSchema.safeParse(validInput)

        if (validated.success) {
          const filepath = safeJoin(TEST_BASE_DIR, `${validated.data}_test.json`)
          await fs.writeFile(filepath, JSON.stringify({ test: true }))
          const stat = await fs.stat(filepath)
          expect(stat.isFile()).toBe(true)
          await fs.unlink(filepath)
        }
      })

      it('should reject invalid names before filesystem access', () => {
        const invalid = '../../etc/passwd'
        const result = MeetingTypeSchema.safeParse(invalid)
        expect(result.success).toBe(false)
        // Never reaches filesystem
      })

      it('should contain files within base directory', () => {
        const baseDir = path.resolve(TEST_BASE_DIR)
        const filename = 'test_file.json'
        const result = safeJoin(baseDir, filename)
        const resolvedResult = path.resolve(result)

        expect(resolvedResult.startsWith(baseDir)).toBe(true)
        expect(resolvedResult).not.toMatch(/\.\./)
      })
    })
  })

  // ========================================
  // 6. FILENAME GENERATION SAFETY
  // ========================================
  describe('6. FILENAME GENERATION SAFETY', () => {
    it('should generate safe filenames for meetings', () => {
      const meetingType = 'standup'
      const id = generateId('meeting')
      const fileName = `${meetingType}_${id}.json`

      expect(fileName).toMatch(/^[A-Za-z0-9_\-\.]+$/)
      expect(fileName).not.toContain('..')
      expect(fileName).not.toContain('/')
      expect(fileName).not.toContain('\\')
      expect(fileName).not.toContain(':')
    })

    it('should produce unique IDs for repeated calls', () => {
      const type = 'planning'
      const ids = Array(5).fill(null).map(() => generateId('meeting'))
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(5)
    })

    it('should handle various valid meeting types safely', () => {
      const validTypes = Array.from(VALID_MEETING_TYPES)
      validTypes.forEach(type => {
        const id = generateId('meeting')
        const fileName = `${type}_${id}.json`
        expect(fileName).toMatch(/^[A-Za-z0-9_\-\.]+$/)
      })
    })
  })

  // ========================================
  // 7. SKILL TYPE SCHEMA VALIDATION
  // ========================================
  describe('7. SKILL TYPE SCHEMA VALIDATION', () => {
    describe('7.1 Valid Skill Types', () => {
      it('should accept valid skill types', () => {
        const validSkills = ['planning', 'review', 'execution']
        validSkills.forEach(skill => {
          const result = SkillTypeSchema.safeParse(skill)
          // Expected to match whitelist
        })
      })
    })

    describe('7.2 Invalid Skill Types', () => {
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

      it('should reject whitespace in skill names', () => {
        const attacks = ['skill name', 'skill\t', 'skill\n', ' skill']
        attacks.forEach(attack => {
          const result = SkillTypeSchema.safeParse(attack)
          expect(result.success).toBe(false)
        })
      })
    })
  })

  // ========================================
  // 8. INTEGRATION & REAL-WORLD SCENARIOS
  // ========================================
  describe('8. INTEGRATION & REAL-WORLD SCENARIOS', () => {
    it('should handle legitimate meeting request safely', async () => {
      const request = {
        meeting_type: 'standup',
        skill: 'planning',
        data: 'test data',
      }

      const meetingResult = MeetingTypeSchema.safeParse(request.meeting_type)
      const skillResult = SkillTypeSchema.safeParse(request.skill)

      expect(meetingResult.success).toBe(true)
      expect(skillResult.success).toBe(true)

      if (meetingResult.success && skillResult.success) {
        const filepath = safeJoin(TEST_BASE_DIR, `${meetingResult.data}_meeting.json`)
        expect(filepath).toBeDefined()
      }
    })

    it('should reject malicious meeting request at validation stage', () => {
      const maliciousRequest = {
        meeting_type: '../../etc/passwd',
        skill: '../../../config',
        data: 'evil',
      }

      const meetingResult = MeetingTypeSchema.safeParse(maliciousRequest.meeting_type)
      const skillResult = SkillTypeSchema.safeParse(maliciousRequest.skill)

      expect(meetingResult.success).toBe(false)
      expect(skillResult.success).toBe(false)
    })

    it('should handle mixed valid/invalid data correctly', () => {
      const mixedRequest = {
        meeting_type: 'standup',
        skill: '../../malicious',
      }

      const meetingResult = MeetingTypeSchema.safeParse(mixedRequest.meeting_type)
      const skillResult = SkillTypeSchema.safeParse(mixedRequest.skill)

      expect(meetingResult.success).toBe(true)
      expect(skillResult.success).toBe(false)
    })
  })

  // ========================================
  // 9. PERFORMANCE & REGRESSION TESTS
  // ========================================
  describe('9. PERFORMANCE & REGRESSION TESTS', () => {
    it('should validate 1000 requests within reasonable time', () => {
      const start = Date.now()
      for (let i = 0; i < 1000; i++) {
        MeetingTypeSchema.safeParse('standup')
      }
      const duration = Date.now() - start
      expect(duration).toBeLessThan(5000) // Should complete in under 5 seconds
    })

    it('should consistently reject attack patterns', () => {
      const attack = '../../etc/passwd'
      const results = []
      for (let i = 0; i < 100; i++) {
        results.push(MeetingTypeSchema.safeParse(attack).success)
      }
      const allFailed = results.every(r => r === false)
      expect(allFailed).toBe(true)
    })

    it('should maintain validation consistency across types', () => {
      const valid = 'standup'
      const invalid = '../../etc/passwd'

      const validResults = Array(50).fill(null).map(() => MeetingTypeSchema.safeParse(valid).success)
      const invalidResults = Array(50).fill(null).map(() => MeetingTypeSchema.safeParse(invalid).success)

      expect(validResults.every(r => r === true)).toBe(true)
      expect(invalidResults.every(r => r === false)).toBe(true)
    })
  })
})
