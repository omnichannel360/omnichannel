/**
 * Security & Edge Case Input Validation Test Suite
 * Tests OWASP Top 10 vulnerabilities and edge cases
 * Including: XSS, SQL Injection, Command Injection, Boundary Cases
 */

import {
  EmailSchema,
  SafeStringSchema,
  CategorySchema,
  IdSchema,
  PositiveNumberSchema,
  AlertSchema,
  KanbanItemSchema,
  MeetingSchema,
  ProfileUpdateSchema,
} from '@/lib/validation/schemas'

describe('Security & Edge Case Validation', () => {
  // ============================================================================
  // XSS PREVENTION TESTS
  // ============================================================================
  describe('XSS Prevention - Script Tags', () => {
    const schema = SafeStringSchema

    it('should reject <script> tag', () => {
      const result = schema.safeParse('<script>alert(1)</script>')
      expect(result.success).toBe(false)
    })

    it('should reject <SCRIPT> uppercase', () => {
      const result = schema.safeParse('<SCRIPT>alert(1)</SCRIPT>')
      expect(result.success).toBe(false)
    })

    it('should reject <script with attributes', () => {
      const result = schema.safeParse('<script src="http://evil.com"></script>')
      expect(result.success).toBe(false)
    })

    it('should reject <script with whitespace', () => {
      const result = schema.safeParse('< script >alert(1)</ script >')
      expect(result.success).toBe(false)
    })

    it('should reject embedded script tag', () => {
      const result = schema.safeParse('Click here<script>alert(1)</script>to continue')
      expect(result.success).toBe(false)
    })

    it('should reject script tag with newlines', () => {
      const result = schema.safeParse('<script>\nalert(1)\n</script>')
      expect(result.success).toBe(false)
    })
  })

  describe('XSS Prevention - JavaScript Protocol', () => {
    const schema = SafeStringSchema

    it('should reject javascript: protocol', () => {
      const result = schema.safeParse('javascript:alert(1)')
      expect(result.success).toBe(false)
    })

    it('should reject javascript: with spaces', () => {
      const result = schema.safeParse('java script:alert(1)')
      expect(result.success).toBe(false)
    })

    it('should reject javascript: in different contexts', () => {
      const result = schema.safeParse('onclick=javascript:alert(1)')
      expect(result.success).toBe(false)
    })

    it('should reject javascript: with encoded spaces', () => {
      const result = schema.safeParse('javascript%20:alert(1)')
      expect(result.success).toBe(false)
    })
  })

  describe('XSS Prevention - Event Handlers', () => {
    const schema = SafeStringSchema

    it('should accept event handler names in text (not HTML)', () => {
      const result = schema.safeParse('onclick is an event handler')
      expect(result.success).toBe(true)
    })

    it('should reject onclick with alert', () => {
      const result = schema.safeParse('onclick="alert(1)"')
      expect(result.success).toBe(false) // Event-handler attribute pattern (on\w+=) is blocked
    })
  })

  describe('XSS Prevention - HTML Entities', () => {
    const schema = SafeStringSchema

    it('should accept HTML entities (safe when decoded)', () => {
      const result = schema.safeParse('&lt;script&gt;')
      expect(result.success).toBe(true)
    })

    it('should accept HTML numeric entities', () => {
      const result = schema.safeParse('&#60;script&#62;')
      expect(result.success).toBe(true)
    })

    it('should accept &nbsp;', () => {
      const result = schema.safeParse('&nbsp;&lt;&gt;')
      expect(result.success).toBe(true)
    })
  })

  // ============================================================================
  // SQL INJECTION PREVENTION TESTS
  // ============================================================================
  describe('SQL Injection Prevention - Quote Escaping', () => {
    const schema = SafeStringSchema

    it('should accept single quotes (raw text)', () => {
      const result = schema.safeParse("user's name")
      expect(result.success).toBe(true)
    })

    it('should accept double quotes', () => {
      const result = schema.safeParse('He said "hello"')
      expect(result.success).toBe(true)
    })

    it('should accept backticks', () => {
      const result = schema.safeParse('`table_name`')
      expect(result.success).toBe(true)
    })

    it('should accept multiple quotes', () => {
      const result = schema.safeParse("It's called 'test' and \"works\"")
      expect(result.success).toBe(true)
    })

    it('should accept SQL keywords in text', () => {
      const result = schema.safeParse('SELECT * FROM users')
      expect(result.success).toBe(true)
    })
  })

  describe('SQL Injection Prevention - Union Based', () => {
    const schema = SafeStringSchema

    it('should accept UNION keyword in text', () => {
      const result = schema.safeParse('UNION SELECT * FROM users')
      expect(result.success).toBe(true)
    })

    it('should accept complex SQL in text', () => {
      const result = schema.safeParse("1' UNION SELECT password FROM admin--")
      expect(result.success).toBe(true)
    })
  })

  describe('SQL Injection Prevention - Comment Based', () => {
    const schema = SafeStringSchema

    it('should accept SQL comment syntax in text', () => {
      const result = schema.safeParse('code -- comment')
      expect(result.success).toBe(true)
    })

    it('should accept block comment syntax', () => {
      const result = schema.safeParse('code /* comment */ more')
      expect(result.success).toBe(true)
    })

    it('should accept comment syntax with semicolon', () => {
      const result = schema.safeParse("code; -- DROP TABLE users")
      expect(result.success).toBe(true)
    })
  })

  // ============================================================================
  // COMMAND INJECTION PREVENTION TESTS
  // ============================================================================
  describe('Command Injection Prevention', () => {
    const schema = SafeStringSchema

    it('should accept shell metacharacters in text', () => {
      const result = schema.safeParse('Use ; | ` $ ( ) & < >')
      expect(result.success).toBe(true)
    })

    it('should accept newline characters in text', () => {
      const result = schema.safeParse('line1\nline2')
      expect(result.success).toBe(true)
    })

    it('should accept command chaining syntax', () => {
      const result = schema.safeParse('command1; command2 | command3')
      expect(result.success).toBe(true)
    })

    it('should accept backtick command substitution', () => {
      const result = schema.safeParse('`whoami`')
      expect(result.success).toBe(true)
    })

    it('should accept $(…) command substitution', () => {
      const result = schema.safeParse('$(whoami)')
      expect(result.success).toBe(true)
    })
  })

  // ============================================================================
  // BOUNDARY AND TYPE COERCION TESTS
  // ============================================================================
  describe('Boundary Tests - Null/Undefined', () => {
    it('should reject null string', () => {
      const result = SafeStringSchema.safeParse(null)
      expect(result.success).toBe(false)
    })

    it('should reject undefined', () => {
      const result = SafeStringSchema.safeParse(undefined)
      expect(result.success).toBe(false)
    })

    it('should accept string "null"', () => {
      const result = SafeStringSchema.safeParse('null')
      expect(result.success).toBe(true)
    })

    it('should accept string "undefined"', () => {
      const result = SafeStringSchema.safeParse('undefined')
      expect(result.success).toBe(true)
    })
  })

  describe('Boundary Tests - Empty vs Spaces', () => {
    it('should accept empty string', () => {
      const result = SafeStringSchema.safeParse('')
      expect(result.success).toBe(true)
    })

    it('should accept string with spaces', () => {
      const result = SafeStringSchema.safeParse('   ')
      expect(result.success).toBe(true)
    })

    it('should accept string with tabs and newlines', () => {
      const result = SafeStringSchema.safeParse('\t\n')
      expect(result.success).toBe(true)
    })
  })

  describe('Boundary Tests - Unicode and Emoji', () => {
    it('should accept unicode characters', () => {
      const result = SafeStringSchema.safeParse('Héllo Wørld')
      expect(result.success).toBe(true)
    })

    it('should accept emoji', () => {
      const result = SafeStringSchema.safeParse('Hello 👋 World 🌍')
      expect(result.success).toBe(true)
    })

    it('should accept Chinese characters', () => {
      const result = SafeStringSchema.safeParse('你好世界')
      expect(result.success).toBe(true)
    })

    it('should accept mixed scripts', () => {
      const result = SafeStringSchema.safeParse('Hello مرحبا שלום 你好')
      expect(result.success).toBe(true)
    })

    it('should accept zero-width characters', () => {
      const result = SafeStringSchema.safeParse('Hello​World')
      expect(result.success).toBe(true)
    })
  })

  describe('Boundary Tests - Length and DOS', () => {
    it('should accept string at max length (1000)', () => {
      const result = SafeStringSchema.safeParse('a'.repeat(1000))
      expect(result.success).toBe(true)
    })

    it('should reject string exceeding max (1001)', () => {
      const result = SafeStringSchema.safeParse('a'.repeat(1001))
      expect(result.success).toBe(false)
    })

    it('should handle very long string attempt gracefully', () => {
      const result = SafeStringSchema.safeParse('a'.repeat(10000))
      expect(result.success).toBe(false)
    })

    it('should reject string with many newlines', () => {
      const result = SafeStringSchema.safeParse('\n'.repeat(1001))
      expect(result.success).toBe(false)
    })
  })

  // ============================================================================
  // ENUM VALIDATION EDGE CASES
  // ============================================================================
  describe('Enum Validation - Case Sensitivity', () => {
    it('should reject uppercase enum value', () => {
      const result = KanbanItemSchema.safeParse({
        title: 'Task',
        status: 'TODO',
      })
      expect(result.success).toBe(false)
    })

    it('should reject mixed case enum', () => {
      const result = KanbanItemSchema.safeParse({
        title: 'Task',
        status: 'In_Progress',
      })
      expect(result.success).toBe(false)
    })

    it('should accept exact enum match', () => {
      const result = KanbanItemSchema.safeParse({
        title: 'Task',
        status: 'in_progress',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('Enum Validation - Whitespace', () => {
    it('should reject enum with leading space', () => {
      const result = KanbanItemSchema.safeParse({
        title: 'Task',
        status: ' todo',
      })
      expect(result.success).toBe(false)
    })

    it('should reject enum with trailing space', () => {
      const result = KanbanItemSchema.safeParse({
        title: 'Task',
        status: 'todo ',
      })
      expect(result.success).toBe(false)
    })

    it('should reject enum with internal space', () => {
      const result = KanbanItemSchema.safeParse({
        title: 'Task',
        status: 'in progress',
      })
      expect(result.success).toBe(false)
    })
  })

  // ============================================================================
  // ARRAY VALIDATION EDGE CASES
  // ============================================================================
  describe('Array Validation - Empty Arrays', () => {
    it('should accept empty attendees array', () => {
      const result = MeetingSchema.safeParse({
        title: 'Meeting',
        attendees: [],
      })
      expect(result.success).toBe(true)
    })

    it('should accept empty tags array', () => {
      const result = AlertSchema.safeParse({
        title: 'Alert',
        message: 'Message',
        tags: [],
      })
      expect(result.success).toBe(true)
    })
  })

  describe('Array Validation - Oversized Arrays', () => {
    it('should reject more than 10 tags', () => {
      const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`)
      const result = AlertSchema.safeParse({
        title: 'Alert',
        message: 'Message',
        tags,
      })
      expect(result.success).toBe(false)
    })

    it('should accept exactly 10 tags', () => {
      const tags = Array.from({ length: 10 }, (_, i) => `tag${i}`)
      const result = AlertSchema.safeParse({
        title: 'Alert',
        message: 'Message',
        tags,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('Array Validation - Mixed Types', () => {
    it('should reject non-string in tags array', () => {
      const result = AlertSchema.safeParse({
        title: 'Alert',
        message: 'Message',
        tags: ['tag1', 123],
      })
      expect(result.success).toBe(false)
    })

    it('should reject null in array', () => {
      const result = AlertSchema.safeParse({
        title: 'Alert',
        message: 'Message',
        tags: ['tag1', null],
      })
      expect(result.success).toBe(false)
    })

    it('should reject object in string array', () => {
      const result = AlertSchema.safeParse({
        title: 'Alert',
        message: 'Message',
        tags: ['tag1', { tag: 'tag2' }],
      })
      expect(result.success).toBe(false)
    })
  })

  // ============================================================================
  // ID AND CATEGORY FORMAT VALIDATION
  // ============================================================================
  describe('ID Validation - Format Edge Cases', () => {
    it('should accept ID with lowercase', () => {
      const result = IdSchema.safeParse('userid')
      expect(result.success).toBe(true)
    })

    it('should accept ID with uppercase', () => {
      const result = IdSchema.safeParse('USERID')
      expect(result.success).toBe(true)
    })

    it('should accept ID with numbers', () => {
      const result = IdSchema.safeParse('user123')
      expect(result.success).toBe(true)
    })

    it('should accept ID with hyphens', () => {
      const result = IdSchema.safeParse('user-id-123')
      expect(result.success).toBe(true)
    })

    it('should accept ID with underscores', () => {
      const result = IdSchema.safeParse('user_id_123')
      expect(result.success).toBe(true)
    })

    it('should reject ID with spaces', () => {
      const result = IdSchema.safeParse('user id')
      expect(result.success).toBe(false)
    })

    it('should reject ID with dots', () => {
      const result = IdSchema.safeParse('user.id')
      expect(result.success).toBe(false)
    })

    it('should reject ID with special chars', () => {
      const result = IdSchema.safeParse('user@id')
      expect(result.success).toBe(false)
    })

    it('should reject ID with forward slash', () => {
      const result = IdSchema.safeParse('user/id')
      expect(result.success).toBe(false)
    })
  })

  // ============================================================================
  // NUMERIC VALIDATION EDGE CASES
  // ============================================================================
  describe('Numeric Validation - Type Coercion', () => {
    it('should reject string number', () => {
      const result = PositiveNumberSchema.safeParse('42')
      expect(result.success).toBe(false)
    })

    it('should reject boolean', () => {
      const result = PositiveNumberSchema.safeParse(true)
      expect(result.success).toBe(false)
    })

    it('should reject array', () => {
      const result = PositiveNumberSchema.safeParse([42])
      expect(result.success).toBe(false)
    })

    it('should reject object', () => {
      const result = PositiveNumberSchema.safeParse({ value: 42 })
      expect(result.success).toBe(false)
    })

    it('should reject NaN', () => {
      const result = PositiveNumberSchema.safeParse(NaN)
      expect(result.success).toBe(false)
    })

    it('should reject Infinity', () => {
      const result = PositiveNumberSchema.safeParse(Infinity)
      expect(result.success).toBe(false)
    })
  })

  describe('Numeric Validation - Boundary Tests', () => {
    it('should accept number at lower boundary (1)', () => {
      const result = PositiveNumberSchema.safeParse(1)
      expect(result.success).toBe(true)
    })

    it('should reject number below boundary (0)', () => {
      const result = PositiveNumberSchema.safeParse(0)
      expect(result.success).toBe(false)
    })

    it('should accept number at upper boundary (999999)', () => {
      const result = PositiveNumberSchema.safeParse(999999)
      expect(result.success).toBe(true)
    })

    it('should reject number above boundary (1000000)', () => {
      const result = PositiveNumberSchema.safeParse(1000000)
      expect(result.success).toBe(false)
    })

    it('should reject float with decimal', () => {
      const result = PositiveNumberSchema.safeParse(42.5)
      expect(result.success).toBe(false)
    })

    it('should accept float without decimal point', () => {
      const result = PositiveNumberSchema.safeParse(42.0)
      expect(result.success).toBe(true)
    })
  })

  // ============================================================================
  // EMAIL VALIDATION EDGE CASES
  // ============================================================================
  describe('Email Validation - Special Cases', () => {
    it('should accept email with plus addressing', () => {
      const result = EmailSchema.safeParse('user+tag@example.com')
      expect(result.success).toBe(true)
    })

    it('should accept email with dots', () => {
      const result = EmailSchema.safeParse('user.name@example.com')
      expect(result.success).toBe(true)
    })

    it('should accept email with hyphens', () => {
      const result = EmailSchema.safeParse('user-name@example.com')
      expect(result.success).toBe(true)
    })

    it('should accept email with numbers', () => {
      const result = EmailSchema.safeParse('user123@example.com')
      expect(result.success).toBe(true)
    })

    it('should accept email with underscore', () => {
      const result = EmailSchema.safeParse('user_name@example.com')
      expect(result.success).toBe(true)
    })

    it('should reject email with space', () => {
      const result = EmailSchema.safeParse('user name@example.com')
      expect(result.success).toBe(false)
    })

    it('should reject email starting with dot', () => {
      const result = EmailSchema.safeParse('.user@example.com')
      expect(result.success).toBe(false)
    })
  })
})
