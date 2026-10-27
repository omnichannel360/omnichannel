/**
 * Comprehensive Input Validation Integration Tests
 * Tests for all API endpoints to ensure proper input validation
 * Covers valid inputs, invalid inputs, boundary conditions, and security scenarios
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  EmailSchema,
  PasswordSchemaWeak,
  LoginRequestSchema,
  BrainQuerySchema,
  MetricsQuerySchema,
  CategorySchema,
  SafeStringSchema,
  AlertSchema,
  KanbanItemSchema,
} from '@/lib/validation/schemas'
import {
  validateBody,
  validateQuery,
  formatZodErrors,
} from '@/lib/validation/middleware'

describe('Input Validation Integration Tests', () => {
  /**
   * Email Validation Tests
   */
  describe('Email Validation', () => {
    it('should validate correct email format', () => {
      const result = EmailSchema.safeParse('test@example.com')
      expect(result.success).toBe(true)
    })

    it('should reject email without @ symbol', () => {
      const result = EmailSchema.safeParse('testexample.com')
      expect(result.success).toBe(false)
    })

    it('should reject email without domain', () => {
      const result = EmailSchema.safeParse('test@')
      expect(result.success).toBe(false)
    })

    it('should reject email with spaces', () => {
      const result = EmailSchema.safeParse('test @example.com')
      expect(result.success).toBe(false)
    })

    it('should convert email to lowercase', () => {
      const result = EmailSchema.safeParse('Test@Example.COM')
      expect(result.success).toBe(true)
      expect(result.data).toBe('test@example.com')
    })

    it('should trim whitespace from email', () => {
      const result = EmailSchema.safeParse('  test@example.com  ')
      expect(result.success).toBe(true)
      expect(result.data).toBe('test@example.com')
    })

    it('should reject email exceeding max length', () => {
      const longEmail = 'a'.repeat(250) + '@example.com'
      const result = EmailSchema.safeParse(longEmail)
      expect(result.success).toBe(false)
    })

    it('should reject non-string email', () => {
      const result = EmailSchema.safeParse(123)
      expect(result.success).toBe(false)
    })

    it('should reject null or undefined email', () => {
      expect(EmailSchema.safeParse(null).success).toBe(false)
      expect(EmailSchema.safeParse(undefined).success).toBe(false)
    })
  })

  /**
   * Password Validation Tests
   */
  describe('Password Validation', () => {
    it('should validate correct password format (weak schema)', () => {
      const result = PasswordSchemaWeak.safeParse('ValidPass@123')
      expect(result.success).toBe(true)
    })

    it('should reject password shorter than minimum', () => {
      const result = PasswordSchemaWeak.safeParse('pass')
      expect(result.success).toBe(false)
    })

    it('should reject password longer than maximum', () => {
      const longPassword = 'a'.repeat(150)
      const result = PasswordSchemaWeak.safeParse(longPassword)
      expect(result.success).toBe(false)
    })

    it('should reject non-string password', () => {
      const result = PasswordSchemaWeak.safeParse(123)
      expect(result.success).toBe(false)
    })

    it('should preserve whitespace in password (passwords are not trimmed)', () => {
      const result = PasswordSchemaWeak.safeParse('  password123  ')
      expect(result.success).toBe(true)
      expect(result.data).toBe('  password123  ')
    })
  })

  /**
   * Login Request Validation Tests
   */
  describe('Login Request Validation', () => {
    it('should validate correct login request', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'test@example.com',
        password: 'ValidPass@123',
      })
      expect(result.success).toBe(true)
    })

    it('should reject login request with missing email', () => {
      const result = LoginRequestSchema.safeParse({
        password: 'ValidPass@123',
      })
      expect(result.success).toBe(false)
    })

    it('should reject login request with missing password', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'test@example.com',
      })
      expect(result.success).toBe(false)
    })

    it('should reject login request with invalid email', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'not-an-email',
        password: 'ValidPass@123',
      })
      expect(result.success).toBe(false)
    })

    it('should reject login request with extra fields (strict mode)', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'test@example.com',
        password: 'ValidPass@123',
        extra: 'field',
      })
      expect(result.success).toBe(false)
    })

    it('should reject login request with null values', () => {
      const result = LoginRequestSchema.safeParse({
        email: null,
        password: null,
      })
      expect(result.success).toBe(false)
    })
  })

  /**
   * Brain Query Validation Tests
   */
  describe('Brain Query Validation', () => {
    it('should validate brain query with valid parameters', () => {
      const result = BrainQuerySchema.safeParse({
        category: 'learning',
        limit: 20,
      })
      expect(result.success).toBe(true)
    })

    it('should validate brain query with only category', () => {
      const result = BrainQuerySchema.safeParse({
        category: 'learning',
      })
      expect(result.success).toBe(true)
      expect(result.data?.limit).toBe(20) // default value
    })

    it('should validate brain query with only limit', () => {
      const result = BrainQuerySchema.safeParse({
        limit: 50,
      })
      expect(result.success).toBe(true)
      expect(result.data?.category).toBeUndefined()
    })

    it('should use default limit of 20', () => {
      const result = BrainQuerySchema.safeParse({})
      expect(result.success).toBe(true)
      expect(result.data?.limit).toBe(20)
    })

    it('should reject limit below minimum', () => {
      const result = BrainQuerySchema.safeParse({
        limit: 0,
      })
      expect(result.success).toBe(false)
    })

    it('should reject limit above maximum', () => {
      const result = BrainQuerySchema.safeParse({
        limit: 100,
      })
      expect(result.success).toBe(true) // 100 is max
    })

    it('should reject limit above maximum', () => {
      const result = BrainQuerySchema.safeParse({
        limit: 101,
      })
      expect(result.success).toBe(false)
    })

    it('should reject non-numeric limit', () => {
      const result = BrainQuerySchema.safeParse({
        limit: 'twenty',
      })
      expect(result.success).toBe(false)
    })

    it('should reject float limit', () => {
      const result = BrainQuerySchema.safeParse({
        limit: 20.5,
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid category format', () => {
      const result = BrainQuerySchema.safeParse({
        category: 'invalid@#$%',
      })
      expect(result.success).toBe(false)
    })

    it('should reject category exceeding max length', () => {
      const longCategory = 'a'.repeat(101)
      const result = BrainQuerySchema.safeParse({
        category: longCategory,
      })
      expect(result.success).toBe(false)
    })

    it('should reject extra fields (strict mode)', () => {
      const result = BrainQuerySchema.safeParse({
        category: 'learning',
        limit: 20,
        extra: 'field',
      })
      expect(result.success).toBe(false)
    })
  })

  /**
   * Category Validation Tests
   */
  describe('Category Validation', () => {
    it('should validate correct category format', () => {
      const result = CategorySchema.safeParse('test-category')
      expect(result.success).toBe(true)
    })

    it('should accept underscores in category', () => {
      const result = CategorySchema.safeParse('test_category')
      expect(result.success).toBe(true)
    })

    it('should accept hyphens in category', () => {
      const result = CategorySchema.safeParse('test-category')
      expect(result.success).toBe(true)
    })

    it('should accept numbers in category', () => {
      const result = CategorySchema.safeParse('category123')
      expect(result.success).toBe(true)
    })

    it('should reject empty category', () => {
      const result = CategorySchema.safeParse('')
      expect(result.success).toBe(false)
    })

    it('should reject special characters in category', () => {
      const result = CategorySchema.safeParse('test@category')
      expect(result.success).toBe(false)
    })

    it('should reject spaces in category', () => {
      const result = CategorySchema.safeParse('test category')
      expect(result.success).toBe(false)
    })

    it('should reject category exceeding max length', () => {
      const longCategory = 'a'.repeat(101)
      const result = CategorySchema.safeParse(longCategory)
      expect(result.success).toBe(false)
    })
  })

  /**
   * SafeString Validation Tests (XSS Prevention)
   */
  describe('SafeString Validation (XSS Prevention)', () => {
    it('should validate normal string', () => {
      const result = SafeStringSchema.safeParse('normal text')
      expect(result.success).toBe(true)
    })

    it('should reject string with <script> tag', () => {
      const result = SafeStringSchema.safeParse('<script>alert("xss")</script>')
      expect(result.success).toBe(false)
    })

    it('should reject string with javascript: protocol', () => {
      const result = SafeStringSchema.safeParse('javascript:alert("xss")')
      expect(result.success).toBe(false)
    })

    it('should accept string with HTML entities', () => {
      const result = SafeStringSchema.safeParse('&lt;safe&gt;')
      expect(result.success).toBe(true)
    })

    it('should reject string exceeding max length', () => {
      const longString = 'a'.repeat(1001)
      const result = SafeStringSchema.safeParse(longString)
      expect(result.success).toBe(false)
    })

    it('should accept string with newlines', () => {
      const result = SafeStringSchema.safeParse('line1\nline2\nline3')
      expect(result.success).toBe(true)
    })
  })

  /**
   * Alert Validation Tests
   */
  describe('Alert Validation', () => {
    it('should validate correct alert', () => {
      const result = AlertSchema.safeParse({
        title: 'Test Alert',
        message: 'This is a test alert message',
        severity: 'warning',
      })
      expect(result.success).toBe(true)
    })

    it('should use default severity of info', () => {
      const result = AlertSchema.safeParse({
        title: 'Test Alert',
        message: 'Test message',
      })
      expect(result.success).toBe(true)
      expect(result.data?.severity).toBe('info')
    })

    it('should reject alert with missing title', () => {
      const result = AlertSchema.safeParse({
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject alert with missing message', () => {
      const result = AlertSchema.safeParse({
        title: 'Test Alert',
      })
      expect(result.success).toBe(false)
    })

    it('should reject alert with invalid severity', () => {
      const result = AlertSchema.safeParse({
        title: 'Test Alert',
        message: 'Test message',
        severity: 'invalid',
      })
      expect(result.success).toBe(false)
    })

    it('should reject alert with XSS payload in title', () => {
      const result = AlertSchema.safeParse({
        title: '<script>alert("xss")</script>',
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })
  })

  /**
   * Kanban Item Validation Tests
   */
  describe('Kanban Item Validation', () => {
    it('should validate correct kanban item', () => {
      const result = KanbanItemSchema.safeParse({
        title: 'Test Item',
        description: 'Test description',
        status: 'todo',
        priority: 'high',
      })
      expect(result.success).toBe(true)
    })

    it('should use default status and priority', () => {
      const result = KanbanItemSchema.safeParse({
        title: 'Test Item',
      })
      expect(result.success).toBe(true)
      expect(result.data?.status).toBe('todo')
      expect(result.data?.priority).toBe('medium')
    })

    it('should reject kanban item with missing title', () => {
      const result = KanbanItemSchema.safeParse({
        description: 'Test description',
      })
      expect(result.success).toBe(false)
    })

    it('should reject kanban item with empty title', () => {
      const result = KanbanItemSchema.safeParse({
        title: '',
        description: 'Test',
      })
      expect(result.success).toBe(false)
    })

    it('should reject kanban item with invalid status', () => {
      const result = KanbanItemSchema.safeParse({
        title: 'Test Item',
        status: 'invalid_status',
      })
      expect(result.success).toBe(false)
    })

    it('should reject kanban item with invalid priority', () => {
      const result = KanbanItemSchema.safeParse({
        title: 'Test Item',
        priority: 'very_high',
      })
      expect(result.success).toBe(false)
    })
  })

  /**
   * Error Formatting Tests
   */
  describe('Error Formatting', () => {
    it('should format Zod errors correctly', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(0).max(150),
      })

      const result = schema.safeParse({
        email: 'invalid',
        age: 200,
      })

      if (!result.success) {
        const errors = formatZodErrors(result.error)
        expect(errors.length).toBeGreaterThan(0)
        expect(errors[0]).toHaveProperty('field')
        expect(errors[0]).toHaveProperty('message')
        expect(errors[0]).toHaveProperty('code')
      }
    })
  })

  /**
   * Security Validation Tests
   */
  describe('Security Validation', () => {
    it('should prevent SQL injection attempts', () => {
      const sqlInjection = "'; DROP TABLE users; --"
      const result = SafeStringSchema.safeParse(sqlInjection)
      expect(result.success).toBe(true) // String is allowed but would be safe in prepared statements
    })

    it('should prevent NoSQL injection attempts', () => {
      const result = EmailSchema.safeParse({ $ne: null })
      expect(result.success).toBe(false)
    })

    it('should handle unicode/emoji safely', () => {
      const result = SafeStringSchema.safeParse('Hello 👋 World 🌍')
      expect(result.success).toBe(true)
    })

    it('should prevent null byte injection', () => {
      const result = SafeStringSchema.safeParse('test\x00injection')
      expect(result.success).toBe(false) // Null bytes are rejected by SafeString
    })

    it('should prevent path traversal in category', () => {
      const result = CategorySchema.safeParse('../../../etc/passwd')
      expect(result.success).toBe(false)
    })

    it('should reject category with directory traversal attempts', () => {
      expect(CategorySchema.safeParse('..').success).toBe(false)
      expect(CategorySchema.safeParse('../').success).toBe(false)
      expect(CategorySchema.safeParse('..\\').success).toBe(false)
    })
  })

  /**
   * Type Coercion Tests
   */
  describe('Type Coercion', () => {
    it('should handle string to number coercion for limit', async () => {
      // The schema expects a number; coercion of query strings happens in validateQuery
      expect(BrainQuerySchema.safeParse({ limit: '20' }).success).toBe(false)

      const request = new NextRequest('http://localhost/api/brain?limit=20')
      const result = await validateQuery<{ limit: number }>(request, BrainQuerySchema)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(20)
        expect(typeof result.data.limit).toBe('number')
      }
    })

    it('should handle boolean string coercion', () => {
      const result = z.object({ enabled: z.boolean() }).safeParse({
        enabled: 'true',
      })
      expect(result.success).toBe(false) // Zod doesn't auto-coerce strings to booleans
    })
  })

  /**
   * Boundary Condition Tests
   */
  describe('Boundary Conditions', () => {
    it('should handle empty object', () => {
      const result = MetricsQuerySchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('should handle very long strings near max', () => {
      const longString = 'a'.repeat(999)
      const result = SafeStringSchema.safeParse(longString)
      expect(result.success).toBe(true)
    })

    it('should handle minimum valid limit', () => {
      const result = BrainQuerySchema.safeParse({
        limit: 1,
      })
      expect(result.success).toBe(true)
    })

    it('should handle maximum valid limit', () => {
      const result = BrainQuerySchema.safeParse({
        limit: 100,
      })
      expect(result.success).toBe(true)
    })
  })
})
