/**
 * Core Validation Schemas Test Suite
 * Tests all base validation schemas with comprehensive coverage
 * Including: valid cases, invalid cases, edge cases, security scenarios, and boundaries
 */

import {
  EmailSchema,
  PasswordSchema,
  PasswordSchemaWeak,
  SafeStringSchema,
  CategorySchema,
  IdSchema,
  PositiveNumberSchema,
  PaginationSchema,
} from '@/lib/validation/schemas'

describe('Core Validation Schemas', () => {
  // ============================================================================
  // EMAIL SCHEMA TESTS
  // ============================================================================
  describe('EmailSchema', () => {
    const schema = EmailSchema

    describe('Valid Email Cases', () => {
      it('should accept valid email addresses', () => {
        const result = schema.safeParse('user@example.com')
        expect(result.success).toBe(true)
      })

      it('should accept emails with subdomains', () => {
        const result = schema.safeParse('user@mail.example.co.uk')
        expect(result.success).toBe(true)
      })

      it('should accept emails with numbers and special chars', () => {
        const result = schema.safeParse('user.name+tag@example.com')
        expect(result.success).toBe(true)
      })

      it('should convert uppercase to lowercase', () => {
        const result = schema.safeParse('USER@EXAMPLE.COM')
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBe('user@example.com')
        }
      })

      it('should trim whitespace', () => {
        const result = schema.safeParse('  user@example.com  ')
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBe('user@example.com')
        }
      })

      it('should accept email at minimum length boundary (3 chars)', () => {
        const result = schema.safeParse('a@b')
        expect(result.success).toBe(true)
      })

      it('should accept email at maximum length boundary (254 chars)', () => {
        const longEmail = 'a'.repeat(243) + '@example.com' // 254 total
        const result = schema.safeParse(longEmail)
        expect(result.success).toBe(true)
      })
    })

    describe('Invalid Email Cases', () => {
      it('should reject email without @', () => {
        const result = schema.safeParse('userexample.com')
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('Invalid email')
      })

      it('should reject email with multiple @', () => {
        const result = schema.safeParse('user@@example.com')
        expect(result.success).toBe(false)
      })

      it('should reject email without domain', () => {
        const result = schema.safeParse('user@')
        expect(result.success).toBe(false)
      })

      it('should reject email without local part', () => {
        const result = schema.safeParse('@example.com')
        expect(result.success).toBe(false)
      })

      it('should reject email shorter than 3 chars', () => {
        const result = schema.safeParse('a@')
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('at least 3 characters')
      })

      it('should reject email longer than 254 chars', () => {
        const longEmail = 'a'.repeat(255) + '@example.com'
        const result = schema.safeParse(longEmail)
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('not exceed 254')
      })

      it('should reject empty string', () => {
        const result = schema.safeParse('')
        expect(result.success).toBe(false)
      })

      it('should reject null', () => {
        const result = schema.safeParse(null)
        expect(result.success).toBe(false)
      })

      it('should reject undefined', () => {
        const result = schema.safeParse(undefined)
        expect(result.success).toBe(false)
      })

      it('should reject non-string types', () => {
        const result = schema.safeParse(123)
        expect(result.success).toBe(false)
      })
    })

    describe('Security Email Cases', () => {
      it('should reject SQL injection in email', () => {
        const result = schema.safeParse("test@example.com'; DROP TABLE users;--")
        expect(result.success).toBe(false)
      })

      it('should reject XSS in email', () => {
        const result = schema.safeParse('user+<script>alert(1)</script>@example.com')
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // PASSWORD SCHEMA TESTS
  // ============================================================================
  describe('PasswordSchema', () => {
    const schema = PasswordSchema

    describe('Valid Password Cases', () => {
      it('should accept valid strong password', () => {
        const result = schema.safeParse('SecurePass123!')
        expect(result.success).toBe(true)
      })

      it('should accept password with uppercase, lowercase, number, special char', () => {
        const result = schema.safeParse('MyPassword@2024')
        expect(result.success).toBe(true)
      })

      it('should accept password at minimum length (8 chars)', () => {
        const result = schema.safeParse('Abc123!@')
        expect(result.success).toBe(true)
      })

      it('should accept password at maximum length (128 chars)', () => {
        const longPassword = 'A' + 'b'.repeat(126) + '1!'
        const result = schema.safeParse(longPassword)
        expect(result.success).toBe(true)
      })
    })

    describe('Invalid Password Cases - Missing Requirements', () => {
      it('should reject password without uppercase', () => {
        const result = schema.safeParse('password123!')
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('uppercase')
      })

      it('should reject password without lowercase', () => {
        const result = schema.safeParse('PASSWORD123!')
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('lowercase')
      })

      it('should reject password without number', () => {
        const result = schema.safeParse('SecurePass!')
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('number')
      })

      it('should reject password without special character', () => {
        const result = schema.safeParse('SecurePass123')
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('special character')
      })
    })

    describe('Invalid Password Cases - Length', () => {
      it('should reject password shorter than 8 chars', () => {
        const result = schema.safeParse('Pass1!')
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('at least 8 characters')
      })

      it('should reject password longer than 128 chars', () => {
        const longPassword = 'A' + 'b'.repeat(128) + '1!'
        const result = schema.safeParse(longPassword)
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('not exceed 128')
      })

      it('should reject empty password', () => {
        const result = schema.safeParse('')
        expect(result.success).toBe(false)
      })
    })

    describe('Invalid Password Cases - Type', () => {
      it('should reject null', () => {
        const result = schema.safeParse(null)
        expect(result.success).toBe(false)
      })

      it('should reject undefined', () => {
        const result = schema.safeParse(undefined)
        expect(result.success).toBe(false)
      })

      it('should reject non-string', () => {
        const result = schema.safeParse(12345)
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // PASSWORD SCHEMA WEAK TESTS
  // ============================================================================
  describe('PasswordSchemaWeak', () => {
    const schema = PasswordSchemaWeak

    describe('Valid Weak Password Cases', () => {
      it('should accept simple weak password', () => {
        const result = schema.safeParse('password123')
        expect(result.success).toBe(true)
      })

      it('should accept password at minimum length (6 chars)', () => {
        const result = schema.safeParse('pass12')
        expect(result.success).toBe(true)
      })

      it('should accept password at maximum length (128 chars)', () => {
        const longPassword = 'a'.repeat(128)
        const result = schema.safeParse(longPassword)
        expect(result.success).toBe(true)
      })
    })

    describe('Invalid Weak Password Cases', () => {
      it('should reject password shorter than 6 chars', () => {
        const result = schema.safeParse('pass1')
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('at least 6 characters')
      })

      it('should reject password longer than 128 chars', () => {
        const longPassword = 'a'.repeat(129)
        const result = schema.safeParse(longPassword)
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // SAFE STRING SCHEMA TESTS
  // ============================================================================
  describe('SafeStringSchema', () => {
    const schema = SafeStringSchema

    describe('Valid Safe String Cases', () => {
      it('should accept normal string', () => {
        const result = schema.safeParse('Hello World')
        expect(result.success).toBe(true)
      })

      it('should accept string with numbers', () => {
        const result = schema.safeParse('Test123')
        expect(result.success).toBe(true)
      })

      it('should accept string with special chars', () => {
        const result = schema.safeParse('Hello-World_2024!')
        expect(result.success).toBe(true)
      })

      it('should accept empty string', () => {
        const result = schema.safeParse('')
        expect(result.success).toBe(true)
      })

      it('should accept string at max length (1000 chars)', () => {
        const longString = 'a'.repeat(1000)
        const result = schema.safeParse(longString)
        expect(result.success).toBe(true)
      })

      it('should accept unicode characters', () => {
        const result = schema.safeParse('Hello 世界 🌍')
        expect(result.success).toBe(true)
      })

      it('should accept HTML entities', () => {
        const result = schema.safeParse('&nbsp;&lt;&gt;')
        expect(result.success).toBe(true)
      })
    })

    describe('Invalid Safe String Cases - XSS Prevention', () => {
      it('should reject <script> tag', () => {
        const result = schema.safeParse('<script>alert(1)</script>')
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('forbidden patterns')
      })

      it('should reject <SCRIPT> uppercase', () => {
        const result = schema.safeParse('<SCRIPT>alert(1)</SCRIPT>')
        expect(result.success).toBe(false)
      })

      it('should reject javascript: protocol', () => {
        const result = schema.safeParse('javascript:alert(1)')
        expect(result.success).toBe(false)
      })

      it('should reject javascript: with spaces', () => {
        const result = schema.safeParse('java script: alert(1)')
        expect(result.success).toBe(false)
      })
    })

    describe('Invalid Safe String Cases - Length', () => {
      it('should reject string longer than 1000 chars', () => {
        const longString = 'a'.repeat(1001)
        const result = schema.safeParse(longString)
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('not exceed 1000')
      })
    })

    describe('Invalid Safe String Cases - Type', () => {
      it('should reject null', () => {
        const result = schema.safeParse(null)
        expect(result.success).toBe(false)
      })

      it('should reject undefined', () => {
        const result = schema.safeParse(undefined)
        expect(result.success).toBe(false)
      })

      it('should reject number', () => {
        const result = schema.safeParse(12345)
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // CATEGORY SCHEMA TESTS
  // ============================================================================
  describe('CategorySchema', () => {
    const schema = CategorySchema

    describe('Valid Category Cases', () => {
      it('should accept simple category', () => {
        const result = schema.safeParse('general')
        expect(result.success).toBe(true)
      })

      it('should accept category with numbers', () => {
        const result = schema.safeParse('category123')
        expect(result.success).toBe(true)
      })

      it('should accept category with underscore', () => {
        const result = schema.safeParse('my_category')
        expect(result.success).toBe(true)
      })

      it('should accept category with hyphen', () => {
        const result = schema.safeParse('my-category')
        expect(result.success).toBe(true)
      })

      it('should accept category at max length (50 chars)', () => {
        const longCategory = 'a'.repeat(50)
        const result = schema.safeParse(longCategory)
        expect(result.success).toBe(true)
      })
    })

    describe('Invalid Category Cases', () => {
      it('should reject empty string', () => {
        const result = schema.safeParse('')
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('must not be empty')
      })

      it('should reject category with space', () => {
        const result = schema.safeParse('my category')
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('only alphanumeric')
      })

      it('should reject category with special chars', () => {
        const result = schema.safeParse('category@tag')
        expect(result.success).toBe(false)
      })

      it('should reject category with dot', () => {
        const result = schema.safeParse('category.tag')
        expect(result.success).toBe(false)
      })

      it('should reject category longer than 50 chars', () => {
        const longCategory = 'a'.repeat(51)
        const result = schema.safeParse(longCategory)
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('not exceed 50')
      })
    })
  })

  // ============================================================================
  // ID SCHEMA TESTS
  // ============================================================================
  describe('IdSchema', () => {
    const schema = IdSchema

    describe('Valid ID Cases', () => {
      it('should accept simple alphanumeric ID', () => {
        const result = schema.safeParse('user123')
        expect(result.success).toBe(true)
      })

      it('should accept ID with underscore', () => {
        const result = schema.safeParse('user_123')
        expect(result.success).toBe(true)
      })

      it('should accept ID with hyphen', () => {
        const result = schema.safeParse('user-123')
        expect(result.success).toBe(true)
      })

      it('should accept ID at max length (100 chars)', () => {
        const longId = 'a'.repeat(100)
        const result = schema.safeParse(longId)
        expect(result.success).toBe(true)
      })
    })

    describe('Invalid ID Cases', () => {
      it('should reject empty string', () => {
        const result = schema.safeParse('')
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('must not be empty')
      })

      it('should reject ID with space', () => {
        const result = schema.safeParse('user 123')
        expect(result.success).toBe(false)
      })

      it('should reject ID with special chars', () => {
        const result = schema.safeParse('user@123')
        expect(result.success).toBe(false)
      })

      it('should reject ID longer than 100 chars', () => {
        const longId = 'a'.repeat(101)
        const result = schema.safeParse(longId)
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // POSITIVE NUMBER SCHEMA TESTS
  // ============================================================================
  describe('PositiveNumberSchema', () => {
    const schema = PositiveNumberSchema

    describe('Valid Positive Number Cases', () => {
      it('should accept positive integer', () => {
        const result = schema.safeParse(42)
        expect(result.success).toBe(true)
      })

      it('should accept number 1 (minimum)', () => {
        const result = schema.safeParse(1)
        expect(result.success).toBe(true)
      })

      it('should accept max value (999999)', () => {
        const result = schema.safeParse(999999)
        expect(result.success).toBe(true)
      })
    })

    describe('Invalid Positive Number Cases', () => {
      it('should reject zero', () => {
        const result = schema.safeParse(0)
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('positive')
      })

      it('should reject negative number', () => {
        const result = schema.safeParse(-5)
        expect(result.success).toBe(false)
      })

      it('should reject float', () => {
        const result = schema.safeParse(3.14)
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('integer')
      })

      it('should reject number exceeding max', () => {
        const result = schema.safeParse(1000000)
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('not exceed 999999')
      })

      it('should reject string number', () => {
        const result = schema.safeParse('42')
        expect(result.success).toBe(false)
      })

      it('should reject null', () => {
        const result = schema.safeParse(null)
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // PAGINATION SCHEMA TESTS
  // ============================================================================
  describe('PaginationSchema', () => {
    const schema = PaginationSchema

    describe('Valid Pagination Cases', () => {
      it('should accept valid limit and offset', () => {
        const result = schema.safeParse({ limit: 20, offset: 0 })
        expect(result.success).toBe(true)
      })

      it('should apply default limit (20)', () => {
        const result = schema.safeParse({ offset: 0 })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.limit).toBe(20)
        }
      })

      it('should apply default offset (0)', () => {
        const result = schema.safeParse({ limit: 50 })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.offset).toBe(0)
        }
      })

      it('should apply both defaults for empty object', () => {
        const result = schema.safeParse({})
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.limit).toBe(20)
          expect(result.data.offset).toBe(0)
        }
      })

      it('should accept limit at minimum (1)', () => {
        const result = schema.safeParse({ limit: 1, offset: 0 })
        expect(result.success).toBe(true)
      })

      it('should accept limit at maximum (1000)', () => {
        const result = schema.safeParse({ limit: 1000, offset: 0 })
        expect(result.success).toBe(true)
      })

      it('should accept offset at minimum (0)', () => {
        const result = schema.safeParse({ limit: 20, offset: 0 })
        expect(result.success).toBe(true)
      })

      it('should accept large offset', () => {
        const result = schema.safeParse({ limit: 20, offset: 999999 })
        expect(result.success).toBe(true)
      })
    })

    describe('Invalid Pagination Cases', () => {
      it('should reject limit less than 1', () => {
        const result = schema.safeParse({ limit: 0, offset: 0 })
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('at least 1')
      })

      it('should reject limit exceeding 1000', () => {
        const result = schema.safeParse({ limit: 1001, offset: 0 })
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('not exceed 1000')
      })

      it('should reject negative offset', () => {
        const result = schema.safeParse({ limit: 20, offset: -1 })
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('0 or greater')
      })

      it('should reject float limit', () => {
        const result = schema.safeParse({ limit: 20.5, offset: 0 })
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('integer')
      })

      it('should reject float offset', () => {
        const result = schema.safeParse({ limit: 20, offset: 5.5 })
        expect(result.success).toBe(false)
      })

      it('should reject string limit', () => {
        const result = schema.safeParse({ limit: '20', offset: 0 })
        expect(result.success).toBe(false)
      })
    })
  })
})
