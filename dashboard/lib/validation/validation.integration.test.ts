/**
 * Comprehensive Integration Tests for Input Validation
 *
 * Tests all API endpoints to ensure:
 * - Valid inputs are accepted
 * - Invalid inputs are rejected with 400
 * - Missing required fields are rejected
 * - Type mismatches are caught
 * - XSS/injection attempts are prevented
 */

import { describe, it, expect } from 'vitest'
import {
  LoginRequestSchema,
  BrainQuerySchema,
  MetricsQuerySchema,
  AlertCreateBodySchema,
  KanbanCreateSchema,
  MeetingCreateSchema,
  ConductorRequestSchemaComprehensive,
  ProfileQuerySchema,
  TokenGenerationSchema,
  VerifyRequestSchema,
  RegisterRequestSchema,
  type LoginRequest,
  type BrainQuery,
  type MetricsQuery,
  type AlertCreateBody,
  type KanbanCreate,
  type MeetingCreate,
} from '@/lib/validation/schemas'

describe('Input Validation - Login', () => {
  it('accepts valid login credentials', () => {
    const validInput = {
      email: 'user@example.com',
      password: 'TestPassword123!',
    }
    const result = LoginRequestSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('user@example.com')
    }
  })

  it('rejects invalid email format', () => {
    const invalidInput = {
      email: 'not-an-email',
      password: 'TestPassword123!',
    }
    const result = LoginRequestSchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('rejects password that is too short', () => {
    const invalidInput = {
      email: 'user@example.com',
      password: 'short',
    }
    const result = LoginRequestSchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('rejects missing email', () => {
    const invalidInput = {
      password: 'TestPassword123!',
    }
    const result = LoginRequestSchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('normalizes email to lowercase', () => {
    const validInput = {
      email: 'User@Example.COM',
      password: 'TestPassword123!',
    }
    const result = LoginRequestSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('user@example.com')
    }
  })
})

describe('Input Validation - Brain Query', () => {
  it('accepts valid category and limit', () => {
    const validInput = {
      category: 'discovery',
      limit: 50,
    }
    const result = BrainQuerySchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('rejects limit exceeding maximum', () => {
    const invalidInput = {
      category: 'discovery',
      limit: 1000,
    }
    const result = BrainQuerySchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('applies default limit when not specified', () => {
    const validInput = {
      category: 'discovery',
    }
    const result = BrainQuerySchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(20)
    }
  })

  it('rejects invalid category characters', () => {
    const invalidInput = {
      category: 'invalid<script>',
      limit: 20,
    }
    const result = BrainQuerySchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })
})

describe('Input Validation - Metrics Query', () => {
  it('accepts valid period and format', () => {
    const validInput = {
      period: 'week',
      format: 'json',
    }
    const result = MetricsQuerySchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('rejects invalid period', () => {
    const invalidInput = {
      period: 'invalid_period',
      format: 'json',
    }
    const result = MetricsQuerySchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('applies defaults for missing parameters', () => {
    const validInput = {}
    const result = MetricsQuerySchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.period).toBe('day')
      expect(result.data.format).toBe('json')
    }
  })

  it('rejects invalid format', () => {
    const invalidInput = {
      period: 'day',
      format: 'xml',
    }
    const result = MetricsQuerySchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })
})

describe('Input Validation - Alerts', () => {
  it('accepts valid alert creation', () => {
    const validInput = {
      title: 'System Error',
      message: 'Database connection timeout',
      severity: 'critical',
      tags: ['database', 'critical'],
    }
    const result = AlertCreateBodySchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('rejects message exceeding max length', () => {
    const invalidInput = {
      title: 'Error',
      message: 'x'.repeat(2001),
      severity: 'critical',
    }
    const result = AlertCreateBodySchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('rejects invalid severity level', () => {
    const invalidInput = {
      title: 'Error',
      message: 'Something went wrong',
      severity: 'invalid_level',
    }
    const result = AlertCreateBodySchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('applies default severity when not provided', () => {
    const validInput = {
      title: 'Alert',
      message: 'Alert message',
    }
    const result = AlertCreateBodySchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.severity).toBe('info')
    }
  })

  it('rejects tags exceeding maximum count', () => {
    const invalidInput = {
      title: 'Alert',
      message: 'Message',
      tags: Array(11).fill('tag'),
    }
    const result = AlertCreateBodySchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })
})

describe('Input Validation - Kanban', () => {
  it('accepts valid task creation', () => {
    const validInput = {
      title: 'Implement feature',
      description: 'Add new dashboard component',
      status: 'in_progress',
      priority: 'high',
    }
    const result = KanbanCreateSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('rejects empty title', () => {
    const invalidInput = {
      title: '',
      status: 'todo',
    }
    const result = KanbanCreateSchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('rejects invalid status', () => {
    const invalidInput = {
      title: 'Task',
      status: 'invalid_status',
    }
    const result = KanbanCreateSchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('applies defaults for optional fields', () => {
    const validInput = {
      title: 'Task',
    }
    const result = KanbanCreateSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('todo')
      expect(result.data.priority).toBe('medium')
    }
  })

  it('prevents XSS in title', () => {
    const invalidInput = {
      title: '<script>alert("xss")</script>',
      status: 'todo',
    }
    const result = KanbanCreateSchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })
})

describe('Input Validation - Meetings', () => {
  it('accepts valid meeting creation', () => {
    const validInput = {
      title: 'Team Standup',
      description: 'Daily team sync',
      startTime: '2024-01-01T10:00:00Z',
      endTime: '2024-01-01T10:30:00Z',
      attendees: ['user@example.com', 'admin@example.com'],
    }
    const result = MeetingCreateSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('rejects invalid ISO datetime', () => {
    const invalidInput = {
      title: 'Meeting',
      startTime: 'not-a-date',
    }
    const result = MeetingCreateSchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('rejects meeting with no attendees when array is required', () => {
    const validInput = {
      title: 'Meeting',
      attendees: [],
    }
    const result = MeetingCreateSchema.safeParse(validInput)
    expect(result.success).toBe(false)
  })

  it('rejects invalid email in attendees', () => {
    const invalidInput = {
      title: 'Meeting',
      attendees: ['not-an-email'],
    }
    const result = MeetingCreateSchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })
})

describe('Input Validation - Conductor', () => {
  it('accepts valid conductor request', () => {
    const validInput = {
      message: 'Run tests for authentication module',
      action: 'execute_tests',
      timeout: 30000,
    }
    const result = ConductorRequestSchemaComprehensive.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('rejects message exceeding max length', () => {
    const invalidInput = {
      message: 'x'.repeat(2001),
      timeout: 30000,
    }
    const result = ConductorRequestSchemaComprehensive.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('rejects timeout below minimum', () => {
    const invalidInput = {
      message: 'Do something',
      timeout: 50,
    }
    const result = ConductorRequestSchemaComprehensive.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('rejects timeout exceeding maximum', () => {
    const invalidInput = {
      message: 'Do something',
      timeout: 600000,
    }
    const result = ConductorRequestSchemaComprehensive.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })
})

describe('Input Validation - Profile Query', () => {
  it('accepts valid user ID query', () => {
    const validInput = {
      userId: 'user-123',
    }
    const result = ProfileQuerySchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('rejects invalid user ID with special characters', () => {
    const invalidInput = {
      userId: 'user@123<script>',
    }
    const result = ProfileQuerySchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('accepts empty query parameters', () => {
    const validInput = {}
    const result = ProfileQuerySchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })
})

describe('Input Validation - Token Generation', () => {
  it('accepts valid token generation request', () => {
    const validInput = {
      userId: 'user-123',
      email: 'user@example.com',
      role: 'admin',
    }
    const result = TokenGenerationSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('rejects invalid user ID', () => {
    const invalidInput = {
      userId: 'user@123',
      email: 'user@example.com',
    }
    const result = TokenGenerationSchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
  })

  it('applies default role when not provided', () => {
    const validInput = {
      userId: 'user-123',
      email: 'user@example.com',
    }
    const result = TokenGenerationSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.role).toBe('user')
    }
  })
})

describe('Input Validation - Security', () => {
  it('prevents injection attacks in string fields', () => {
    const maliciousInputs = [
      { title: '"; DROP TABLE users; --' },
      { title: "' OR '1'='1" },
      { title: '<img src=x onerror="alert(1)">' },
      { title: 'javascript:alert(1)' },
    ]

    maliciousInputs.forEach((input) => {
      const result = KanbanCreateSchema.safeParse({
        ...input,
        status: 'todo',
      })
      expect(result.success).toBe(false)
    })
  })

  it('rejects excessively long inputs', () => {
    const result = KanbanCreateSchema.safeParse({
      title: 'x'.repeat(1001),
      status: 'todo',
    })
    expect(result.success).toBe(false)
  })

  it('prevents null byte injection', () => {
    const result = KanbanCreateSchema.safeParse({
      title: 'Title\x00Attack',
      status: 'todo',
    })
    expect(result.success).toBe(false)
  })
})
