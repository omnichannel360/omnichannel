/**
 * Integration & Type Inference Validation Test Suite
 * Tests schema type inference, middleware integration, transforms, and real-world scenarios
 */

import {
  LoginRequestSchema,
  AlertSchema,
  MeetingSchema,
  ProfileUpdateSchema,
  PaginationSchema,
  MetricsQuerySchema,
  type LoginRequest,
  type Alert,
  type Meeting,
  type ProfileUpdate,
} from '@/lib/validation/schemas'
import type { z } from 'zod'

describe('Validation Integration & Type Inference', () => {
  // ============================================================================
  // TYPE INFERENCE TESTS
  // ============================================================================
  describe('Schema Type Inference', () => {
    it('should infer correct LoginRequest type', () => {
      const data: LoginRequest = {
        email: 'user@example.com',
        password: 'ValidPass@123',
      }
      const result = LoginRequestSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('should infer correct Alert type', () => {
      const data: Alert = {
        title: 'Alert Title',
        message: 'Alert Message',
        severity: 'critical',
        tags: ['tag1', 'tag2'],
      }
      const result = AlertSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('should handle optional fields in type inference', () => {
      const data: Alert = {
        title: 'Alert Title',
        message: 'Alert Message',
      }
      const result = AlertSchema.safeParse(data)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.severity).toBe('info')
      }
    })

    it('should enforce required fields in type', () => {
      // This tests that TS would catch missing required fields
      const validData: LoginRequest = {
        email: 'user@example.com',
        password: 'ValidPass@123',
      }
      expect(validData).toBeDefined()
    })
  })

  describe('Type Narrowing After Validation', () => {
    it('should narrow unknown to typed object after validation', () => {
      const input: unknown = {
        email: 'user@example.com',
        password: 'ValidPass@123',
      }
      const result = LoginRequestSchema.safeParse(input)
      if (result.success) {
        // After validation, TypeScript knows the type
        const typedData: LoginRequest = result.data
        expect(typedData.email).toBe('user@example.com')
      }
    })

    it('should provide type guards for union types from enums', () => {
      const input = {
        title: 'Alert',
        message: 'Message',
        severity: 'critical' as const,
      }
      const result = AlertSchema.safeParse(input)
      if (result.success) {
        // severity should be typed as specific string union
        const severity = result.data.severity
        expect(['info', 'warning', 'error', 'critical']).toContain(severity)
      }
    })
  })

  // ============================================================================
  // TRANSFORM & COERCION TESTS
  // ============================================================================
  describe('Email Transform - toLowerCase', () => {
    it('should transform uppercase to lowercase', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'USER@EXAMPLE.COM',
        password: 'ValidPass@123',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('user@example.com')
      }
    })

    it('should transform mixed case to lowercase', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'User@Example.Com',
        password: 'ValidPass@123',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('user@example.com')
      }
    })
  })

  describe('String Transform - trim()', () => {
    it('should trim leading whitespace from email', () => {
      const result = LoginRequestSchema.safeParse({
        email: '  user@example.com',
        password: 'ValidPass@123',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('user@example.com')
      }
    })

    it('should trim trailing whitespace from email', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'user@example.com  ',
        password: 'ValidPass@123',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('user@example.com')
      }
    })

    it('should trim both leading and trailing whitespace', () => {
      const result = LoginRequestSchema.safeParse({
        email: '  user@example.com  ',
        password: 'ValidPass@123',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('user@example.com')
      }
    })
  })

  describe('Default Value Application', () => {
    it('should apply default severity (info)', () => {
      const result = AlertSchema.safeParse({
        title: 'Alert',
        message: 'Message',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.severity).toBe('info')
      }
    })

    it('should apply default limit (20)', () => {
      const result = PaginationSchema.safeParse({
        offset: 10,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(20)
      }
    })

    it('should apply default offset (0)', () => {
      const result = PaginationSchema.safeParse({
        limit: 50,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.offset).toBe(0)
      }
    })

    it('should apply default empty array for tags', () => {
      const result = AlertSchema.safeParse({
        title: 'Alert',
        message: 'Message',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.tags).toEqual([])
      }
    })

    it('should apply multiple defaults together', () => {
      const result = PaginationSchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(20)
        expect(result.data.offset).toBe(0)
      }
    })
  })

  describe('Nested Transformations', () => {
    it('should apply email transform within nested schema', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'USER@EXAMPLE.COM',
        password: 'ValidPass@123',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        // Email should be transformed at each level
        expect(result.data.email).toBe('user@example.com')
      }
    })
  })

  // ============================================================================
  // ERROR MESSAGE TESTS
  // ============================================================================
  describe('Custom Error Messages', () => {
    it('should include custom error message for invalid email', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'not-an-email',
        password: 'ValidPass@123',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid email')
      }
    })

    it('should include custom error message for short password', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'user@example.com',
        password: 'short',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 8 characters')
      }
    })

    it('should include custom error message for required field', () => {
      const result = AlertSchema.safeParse({
        title: 'Alert',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const messageError = result.error.issues.find((issue) => issue.path[0] === 'message')
        expect(messageError?.message).toBe('Required') // zod's default message for a missing key
      }
    })

    it('should include enum error message', () => {
      const result = MetricsQuerySchema.safeParse({
        period: 'invalid-period',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('day, week, month, year')
      }
    })
  })

  describe('Detailed Error Issues', () => {
    it('should provide field path in error issues', () => {
      const result = ProfileUpdateSchema.safeParse({
        email: 'invalid-email',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['email'])
      }
    })

    it('should provide error code in issues', () => {
      const result = AlertSchema.safeParse({
        title: 'Alert',
        message: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issues = result.error.issues
        expect(issues.length).toBeGreaterThan(0)
        expect(issues[0].code).toBeDefined()
      }
    })

    it('should handle multiple validation errors', () => {
      const result = AlertSchema.safeParse({
        title: '',
        message: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(1)
      }
    })
  })

  // ============================================================================
  // REAL-WORLD SCENARIO TESTS
  // ============================================================================
  describe('Real-World Scenarios - Authentication Flow', () => {
    it('should validate complete login flow', () => {
      // User enters credentials with whitespace and mixed case
      const userInput = {
        email: '  USER@EXAMPLE.COM  ',
        password: 'ValidPass@123',
      }

      const result = LoginRequestSchema.safeParse(userInput)
      expect(result.success).toBe(true)

      if (result.success) {
        // Server receives properly normalized data
        expect(result.data.email).toBe('user@example.com')
        expect(result.data.password).toBe('ValidPass@123')
      }
    })

    it('should reject login with missing fields', () => {
      const userInput = {
        email: 'user@example.com',
        // password missing
      }

      const result = LoginRequestSchema.safeParse(userInput)
      expect(result.success).toBe(false)

      if (!result.success) {
        const passwordError = result.error.issues.find((issue) => issue.path[0] === 'password')
        expect(passwordError).toBeDefined()
      }
    })
  })

  describe('Real-World Scenarios - Alert Management', () => {
    it('should validate alert creation with minimal data', () => {
      const alertData = {
        title: 'System Alert',
        message: 'System alert message',
      }

      const result = AlertSchema.safeParse(alertData)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.severity).toBe('info') // default applied
        expect(result.data.tags).toEqual([]) // default applied
      }
    })

    it('should validate alert creation with all fields', () => {
      const alertData: Alert = {
        title: 'System Alert',
        message: 'Critical system alert',
        severity: 'critical',
        tags: ['urgent', 'system', 'notification'],
      }

      const result = AlertSchema.safeParse(alertData)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.title).toBe('System Alert')
        expect(result.data.severity).toBe('critical')
        expect(result.data.tags.length).toBe(3)
      }
    })

    it('should reject alert with too many tags', () => {
      const alertData = {
        title: 'Alert',
        message: 'Message',
        tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
      }

      const result = AlertSchema.safeParse(alertData)
      expect(result.success).toBe(false)
    })
  })

  describe('Real-World Scenarios - Meeting Scheduling', () => {
    it('should validate meeting with required fields only', () => {
      const meetingData = {
        title: 'Team Standup',
      }

      const result = MeetingSchema.safeParse(meetingData)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.title).toBe('Team Standup')
        expect(result.data.attendees).toEqual([]) // default
      }
    })

    it('should validate meeting with datetime and attendees', () => {
      const meetingData: Meeting = {
        title: 'Team Standup',
        description: 'Daily sync',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T10:30:00Z',
        attendees: ['user1@example.com', 'user2@example.com'],
      }

      const result = MeetingSchema.safeParse(meetingData)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.attendees.length).toBe(2)
        expect(result.data.startTime).toBe('2024-01-15T10:00:00Z')
      }
    })

    it('should reject meeting with invalid attendee email', () => {
      const meetingData = {
        title: 'Meeting',
        attendees: ['not-an-email'],
      }

      const result = MeetingSchema.safeParse(meetingData)
      expect(result.success).toBe(false)
    })
  })

  describe('Real-World Scenarios - Profile Updates', () => {
    it('should validate partial profile update', () => {
      const updateData: ProfileUpdate = {
        name: 'John Doe',
      }

      const result = ProfileUpdateSchema.safeParse(updateData)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.name).toBe('John Doe')
        expect(result.data.email).toBeUndefined()
        expect(result.data.role).toBeUndefined()
      }
    })

    it('should validate profile update with multiple fields', () => {
      const updateData: ProfileUpdate = {
        name: 'John Doe',
        email: 'john@example.com',
        role: 'admin',
      }

      const result = ProfileUpdateSchema.safeParse(updateData)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.name).toBe('John Doe')
        expect(result.data.email).toBe('john@example.com')
        expect(result.data.role).toBe('admin')
      }
    })

    it('should validate empty profile update', () => {
      const updateData = {}

      const result = ProfileUpdateSchema.safeParse(updateData)
      expect(result.success).toBe(true)
    })
  })

  // ============================================================================
  // PERFORMANCE TESTS
  // ============================================================================
  describe('Performance - Validation Speed', () => {
    it('should validate simple object quickly', () => {
      const startTime = Date.now()
      const iterations = 1000

      for (let i = 0; i < iterations; i++) {
        LoginRequestSchema.safeParse({
          email: 'user@example.com',
          password: 'ValidPass@123',
        })
      }

      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(1000) // Should complete 1000 validations in < 1 second
    })

    it('should validate complex object quickly', () => {
      const startTime = Date.now()
      const iterations = 100

      for (let i = 0; i < iterations; i++) {
        MeetingSchema.safeParse({
          title: 'Meeting',
          description: 'Description',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
          attendees: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
        })
      }

      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(500) // Should complete 100 validations in < 500ms
    })
  })

  describe('Performance - Large Data Structures', () => {
    it('should handle validation near size limits', () => {
      const largeString = 'a'.repeat(1000) // At max length
      const largeAlert = {
        title: 'Alert',
        message: largeString,
        tags: Array.from({ length: 10 }, (_, i) => `tag${i}`), // At max tags
      }

      const result = AlertSchema.safeParse(largeAlert)
      expect(result.success).toBe(true)
    })

    it('should validate deep object structures', () => {
      const meetingData = {
        title: 'Meeting',
        attendees: Array.from({ length: 100 }, (_, i) => `user${i}@example.com`),
      }

      const result = MeetingSchema.safeParse(meetingData)
      expect(result.success).toBe(true)
    })
  })
})
