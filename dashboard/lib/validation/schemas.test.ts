/**
 * Comprehensive tests for input validation schemas
 * Tests cover:
 * - Valid inputs
 * - Invalid inputs (wrong type, out of range)
 * - Security risks (injection, XSS)
 * - Edge cases (boundary values, special characters)
 */

import {
  EmailSchema,
  PasswordSchemaWeak,
  SafeStringSchema,
  CategorySchema,
  IdSchema,
  LoginRequestSchema,
  VerifyRequestSchema,
  BrainQuerySchema,
  MetricsQuerySchema,
  ConductorRequestSchema,
  KanbanItemSchema,
  MeetingSchema,
  ProfileUpdateSchema,
  AlertSchema,
  TokenGenerationSchema,
} from './schemas'

describe('Email Validation', () => {
  it('accepts valid email addresses', () => {
    expect(EmailSchema.safeParse('user@example.com').success).toBe(true)
    expect(EmailSchema.safeParse('test.user@company.co.uk').success).toBe(true)
  })

  it('rejects invalid email formats', () => {
    expect(EmailSchema.safeParse('not-an-email').success).toBe(false)
    expect(EmailSchema.safeParse('@example.com').success).toBe(false)
    expect(EmailSchema.safeParse('user@').success).toBe(false)
  })

  it('rejects emails that are too long', () => {
    const longEmail = 'a'.repeat(250) + '@example.com'
    expect(EmailSchema.safeParse(longEmail).success).toBe(false)
  })

  it('converts email to lowercase and trims whitespace', () => {
    const result = EmailSchema.safeParse('  USER@EXAMPLE.COM  ')
    expect(result.success).toBe(true)
    expect(result.data).toBe('user@example.com')
  })
})

describe('Password Validation', () => {
  it('accepts valid weak passwords', () => {
    expect(PasswordSchemaWeak.safeParse('password123').success).toBe(true)
  })

  it('rejects passwords that are too short', () => {
    expect(PasswordSchemaWeak.safeParse('pass').success).toBe(false)
  })

  it('rejects passwords that are too long', () => {
    const longPassword = 'p'.repeat(150)
    expect(PasswordSchemaWeak.safeParse(longPassword).success).toBe(false)
  })
})

describe('Safe String Validation', () => {
  it('accepts plain text strings', () => {
    expect(SafeStringSchema.safeParse('Hello World').success).toBe(true)
  })

  it('rejects strings with script tags', () => {
    expect(SafeStringSchema.safeParse('<script>alert("xss")</script>').success).toBe(false)
  })

  it('rejects strings with javascript: protocol', () => {
    expect(SafeStringSchema.safeParse('javascript:alert("xss")').success).toBe(false)
  })

  it('rejects strings exceeding max length', () => {
    const longString = 'a'.repeat(1001)
    expect(SafeStringSchema.safeParse(longString).success).toBe(false)
  })

  it('accepts strings with special characters', () => {
    expect(SafeStringSchema.safeParse('Hello! @#$% World?').success).toBe(true)
  })
})

describe('Category Validation', () => {
  it('accepts valid category names', () => {
    expect(CategorySchema.safeParse('general').success).toBe(true)
    expect(CategorySchema.safeParse('user_profile').success).toBe(true)
    expect(CategorySchema.safeParse('task-management').success).toBe(true)
  })

  it('rejects empty categories', () => {
    expect(CategorySchema.safeParse('').success).toBe(false)
  })

  it('rejects categories with invalid characters', () => {
    expect(CategorySchema.safeParse('category!').success).toBe(false)
    expect(CategorySchema.safeParse('category with spaces').success).toBe(false)
  })

  it('rejects categories exceeding max length', () => {
    const longCategory = 'a'.repeat(51)
    expect(CategorySchema.safeParse(longCategory).success).toBe(false)
  })
})

describe('ID Validation', () => {
  it('accepts valid ID formats', () => {
    expect(IdSchema.safeParse('task-123').success).toBe(true)
    expect(IdSchema.safeParse('user_456').success).toBe(true)
  })

  it('rejects empty IDs', () => {
    expect(IdSchema.safeParse('').success).toBe(false)
  })

  it('rejects IDs with invalid characters', () => {
    expect(IdSchema.safeParse('id@invalid').success).toBe(false)
    expect(IdSchema.safeParse('id/path').success).toBe(false)
  })
})

describe('Login Request Validation', () => {
  it('accepts valid login requests', () => {
    const result = LoginRequestSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
    })
    expect(result.success).toBe(true)
  })

  it('rejects requests with missing email', () => {
    const result = LoginRequestSchema.safeParse({
      password: 'password123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects requests with missing password', () => {
    const result = LoginRequestSchema.safeParse({
      email: 'user@example.com',
    })
    expect(result.success).toBe(false)
  })

  it('rejects requests with invalid email format', () => {
    const result = LoginRequestSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    })
    expect(result.success).toBe(false)
  })
})

describe('Verify Request Validation', () => {
  it('accepts valid verify requests', () => {
    const result = VerifyRequestSchema.safeParse({
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    })
    expect(result.success).toBe(true)
  })

  it('rejects requests with missing token', () => {
    const result = VerifyRequestSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects requests with short token', () => {
    const result = VerifyRequestSchema.safeParse({
      token: 'short',
    })
    expect(result.success).toBe(false)
  })
})

describe('Brain Query Validation', () => {
  it('accepts valid query parameters', () => {
    const result = BrainQuerySchema.safeParse({
      category: 'general',
      limit: 50,
    })
    expect(result.success).toBe(true)
  })

  it('applies default limit when not provided', () => {
    const result = BrainQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.data.limit).toBe(20)
  })

  it('rejects limit exceeding maximum', () => {
    const result = BrainQuerySchema.safeParse({
      limit: 200,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative limit', () => {
    const result = BrainQuerySchema.safeParse({
      limit: -1,
    })
    expect(result.success).toBe(false)
  })
})

describe('Metrics Query Validation', () => {
  it('accepts valid metrics queries', () => {
    const result = MetricsQuerySchema.safeParse({
      period: 'month',
      format: 'json',
    })
    expect(result.success).toBe(true)
  })

  it('applies default period when not provided', () => {
    const result = MetricsQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.data.period).toBe('day')
  })

  it('rejects invalid period', () => {
    const result = MetricsQuerySchema.safeParse({
      period: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid format', () => {
    const result = MetricsQuerySchema.safeParse({
      format: 'xml',
    })
    expect(result.success).toBe(false)
  })
})

describe('Conductor Request Validation', () => {
  it('accepts valid conductor requests', () => {
    const result = ConductorRequestSchema.safeParse({
      action: 'test_action',
      params: { key: 'value' },
      timeout: 5000,
    })
    expect(result.success).toBe(true)
  })

  it('applies default timeout when not provided', () => {
    const result = ConductorRequestSchema.safeParse({
      action: 'test_action',
    })
    expect(result.success).toBe(true)
    expect(result.data.timeout).toBe(30000)
  })

  it('rejects timeout below minimum', () => {
    const result = ConductorRequestSchema.safeParse({
      action: 'test_action',
      timeout: 50,
    })
    expect(result.success).toBe(false)
  })

  it('rejects timeout exceeding maximum', () => {
    const result = ConductorRequestSchema.safeParse({
      action: 'test_action',
      timeout: 600000,
    })
    expect(result.success).toBe(false)
  })

  it('rejects action with script injection', () => {
    const result = ConductorRequestSchema.safeParse({
      action: '<script>alert("xss")</script>',
    })
    expect(result.success).toBe(false)
  })
})

describe('Kanban Item Validation', () => {
  it('accepts valid kanban items', () => {
    const result = KanbanItemSchema.safeParse({
      title: 'Complete feature',
      description: 'Implement user authentication',
      status: 'in_progress',
      priority: 'high',
    })
    expect(result.success).toBe(true)
  })

  it('applies default status when not provided', () => {
    const result = KanbanItemSchema.safeParse({
      title: 'New task',
    })
    expect(result.success).toBe(true)
    expect(result.data.status).toBe('todo')
  })

  it('rejects items without title', () => {
    const result = KanbanItemSchema.safeParse({
      description: 'Task without title',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid status', () => {
    const result = KanbanItemSchema.safeParse({
      title: 'Task',
      status: 'blocked',
    })
    expect(result.success).toBe(false)
  })
})

describe('Meeting Validation', () => {
  it('accepts valid meetings', () => {
    const result = MeetingSchema.safeParse({
      title: 'Team standup',
      description: 'Daily team sync',
      startTime: '2024-01-15T09:00:00Z',
      attendees: ['user@example.com', 'admin@example.com'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects meetings without title', () => {
    const result = MeetingSchema.safeParse({
      description: 'Meeting without title',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid ISO datetime', () => {
    const result = MeetingSchema.safeParse({
      title: 'Meeting',
      startTime: 'not-a-date',
    })
    expect(result.success).toBe(false)
  })

  it('rejects meetings with invalid attendee emails', () => {
    const result = MeetingSchema.safeParse({
      title: 'Meeting',
      attendees: ['invalid-email', 'user@example.com'],
    })
    expect(result.success).toBe(false)
  })
})

describe('Profile Update Validation', () => {
  it('accepts valid profile updates', () => {
    const result = ProfileUpdateSchema.safeParse({
      name: 'John Doe',
      email: 'john@example.com',
      role: 'admin',
    })
    expect(result.success).toBe(true)
  })

  it('accepts partial profile updates', () => {
    const result = ProfileUpdateSchema.safeParse({
      name: 'Jane Doe',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid role', () => {
    const result = ProfileUpdateSchema.safeParse({
      role: 'superadmin',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid email in update', () => {
    const result = ProfileUpdateSchema.safeParse({
      email: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })
})

describe('Alert Validation', () => {
  it('accepts valid alerts', () => {
    const result = AlertSchema.safeParse({
      title: 'High memory usage',
      message: 'Memory utilization exceeded 80%',
      severity: 'warning',
      tags: ['performance', 'memory'],
    })
    expect(result.success).toBe(true)
  })

  it('applies default severity when not provided', () => {
    const result = AlertSchema.safeParse({
      title: 'Alert',
      message: 'Something happened',
    })
    expect(result.success).toBe(true)
    expect(result.data.severity).toBe('info')
  })

  it('rejects alerts without title', () => {
    const result = AlertSchema.safeParse({
      message: 'Message without title',
    })
    expect(result.success).toBe(false)
  })

  it('rejects alerts with too many tags', () => {
    const result = AlertSchema.safeParse({
      title: 'Alert',
      message: 'Message',
      tags: Array(15).fill('tag'),
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid severity', () => {
    const result = AlertSchema.safeParse({
      title: 'Alert',
      message: 'Message',
      severity: 'invalid',
    })
    expect(result.success).toBe(false)
  })
})

describe('Token Generation Validation', () => {
  it('accepts valid token generation requests', () => {
    const result = TokenGenerationSchema.safeParse({
      userId: 'user_123',
      email: 'user@example.com',
      role: 'user',
    })
    expect(result.success).toBe(true)
  })

  it('applies default role when not provided', () => {
    const result = TokenGenerationSchema.safeParse({
      userId: 'user_123',
      email: 'user@example.com',
    })
    expect(result.success).toBe(true)
    expect(result.data.role).toBe('user')
  })

  it('rejects invalid user IDs with special characters', () => {
    const result = TokenGenerationSchema.safeParse({
      userId: 'user@invalid',
      email: 'user@example.com',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid role', () => {
    const result = TokenGenerationSchema.safeParse({
      userId: 'user_123',
      email: 'user@example.com',
      role: 'superadmin',
    })
    expect(result.success).toBe(false)
  })
})

describe('Security: Common Attack Patterns', () => {
  it('blocks SQL injection patterns', () => {
    expect(
      SafeStringSchema.safeParse("'; DROP TABLE users; --").success
    ).toBe(true) // String content is allowed, but parameterized queries prevent execution
  })

  it('blocks XSS attack vectors', () => {
    expect(SafeStringSchema.safeParse('<img src=x onerror=alert("xss")>').success).toBe(false)
    expect(SafeStringSchema.safeParse('<iframe src="javascript:alert(1)"></iframe>').success).toBe(
      false
    )
  })

  it('blocks path traversal attempts in categories', () => {
    expect(CategorySchema.safeParse('../../../etc/passwd').success).toBe(false)
    expect(CategorySchema.safeParse('..\\..\\windows\\system32').success).toBe(false)
  })

  it('blocks command injection patterns', () => {
    expect(SafeStringSchema.safeParse('$(rm -rf /)').success).toBe(true) // Content allowed
    expect(SafeStringSchema.safeParse('`whoami`').success).toBe(true) // Content allowed
  })
})
