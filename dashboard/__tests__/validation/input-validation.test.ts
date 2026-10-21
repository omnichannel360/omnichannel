/**
 * Comprehensive input validation tests for all API routes
 * Tests cover valid inputs, invalid inputs, edge cases, and security scenarios
 */

import { z } from 'zod'
import {
  LoginRequestSchema,
  VerifyRequestSchema,
  BrainQuerySchema,
  MetricsQuerySchema,
  ConductorRequestSchema,
  HealthQuerySchema,
  KanbanItemSchema,
  MeetingSchema,
  ProfileUpdateSchema,
  AlertSchema,
  ConductorRequestSchemaComprehensive,
} from '@/lib/validation/schemas'

describe('Input Validation - Authentication', () => {
  describe('LoginRequestSchema', () => {
    test('valid login request', () => {
      const input = {
        email: 'user@example.com',
        password: 'ValidPass@123',
      }
      const result = LoginRequestSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('user@example.com')
      }
    })

    test('invalid email format', () => {
      const input = {
        email: 'not-an-email',
        password: 'ValidPass@123',
      }
      const result = LoginRequestSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    test('missing password', () => {
      const input = {
        email: 'user@example.com',
      }
      const result = LoginRequestSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    test('password too short', () => {
      const input = {
        email: 'user@example.com',
        password: 'short',
      }
      const result = LoginRequestSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    test('email normalization (lowercase + trim)', () => {
      const input = {
        email: '  USER@EXAMPLE.COM  ',
        password: 'ValidPass@123',
      }
      const result = LoginRequestSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('user@example.com')
      }
    })
  })

  describe('VerifyRequestSchema', () => {
    test('valid verification request', () => {
      const input = {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      }
      const result = VerifyRequestSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    test('token too short', () => {
      const input = {
        token: 'short',
      }
      const result = VerifyRequestSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    test('token too long', () => {
      const input = {
        token: 'a'.repeat(1001),
      }
      const result = VerifyRequestSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })
})

describe('Input Validation - Query Parameters', () => {
  describe('BrainQuerySchema', () => {
    test('valid with category', () => {
      const input = {
        category: 'meeting-notes',
        limit: 20,
      }
      const result = BrainQuerySchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(20)
      }
    })

    test('invalid category (special characters)', () => {
      const input = {
        category: 'invalid@category!',
      }
      const result = BrainQuerySchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    test('default limit applied', () => {
      const input = {}
      const result = BrainQuerySchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(20)
      }
    })
  })

  describe('MetricsQuerySchema', () => {
    test('valid period parameter', () => {
      const input = {
        period: 'week',
        format: 'json',
      }
      const result = MetricsQuerySchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    test('invalid period value', () => {
      const input = {
        period: 'invalid',
      }
      const result = MetricsQuerySchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    test('all valid periods', () => {
      const periods = ['day', 'week', 'month', 'year']
      periods.forEach(period => {
        const result = MetricsQuerySchema.safeParse({ period })
        expect(result.success).toBe(true)
      })
    })
  })

  describe('HealthQuerySchema', () => {
    test('valid detailed parameter', () => {
      const input = {
        detailed: 'true',
      }
      const result = HealthQuerySchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.detailed).toBe(true)
      }
    })

    test('boolean transformation', () => {
      const inputs = [
        { detailed: 'true', expected: true },
        { detailed: 'false', expected: false },
      ]
      inputs.forEach(({ detailed, expected }) => {
        const result = HealthQuerySchema.safeParse({ detailed })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.detailed).toBe(expected)
        }
      })
    })
  })
})

describe('Input Validation - Request Bodies', () => {
  describe('ConductorRequestSchemaComprehensive', () => {
    test('valid conductor request', () => {
      const input = {
        message: 'Please fix the authentication bug',
        action: 'fix-bug',
        params: {
          component: 'auth-module',
          priority: 'high',
        },
        timeout: 30000,
      }
      const result = ConductorRequestSchemaComprehensive.safeParse(input)
      expect(result.success).toBe(true)
    })

    test('message validation', () => {
      const inputs = [
        { message: '', valid: false }, // empty
        { message: 'a'.repeat(2001), valid: false }, // too long
        { message: 'Valid message', valid: true },
      ]
      inputs.forEach(({ message, valid }) => {
        const result = ConductorRequestSchemaComprehensive.safeParse({ message })
        expect(result.success).toBe(valid)
      })
    })

    test('timeout validation', () => {
      const inputs = [
        { timeout: 50, valid: false }, // too small
        { timeout: 500000, valid: false }, // too large
        { timeout: 30000, valid: true },
      ]
      inputs.forEach(({ timeout, valid }) => {
        const result = ConductorRequestSchemaComprehensive.safeParse({ message: 'test', timeout })
        expect(result.success).toBe(valid)
      })
    })

    test('default values applied', () => {
      const input = { message: 'test message' }
      const result = ConductorRequestSchemaComprehensive.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.timeout).toBe(30000)
        expect(result.data.params).toEqual({})
      }
    })
  })

  describe('KanbanItemSchema', () => {
    test('valid kanban item', () => {
      const input = {
        title: 'Complete API validation',
        description: 'Add input validation to all routes',
        status: 'in_progress',
        priority: 'high',
      }
      const result = KanbanItemSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    test('valid status enums', () => {
      const statuses = ['todo', 'in_progress', 'done']
      statuses.forEach(status => {
        const result = KanbanItemSchema.safeParse({ title: 'test', status })
        expect(result.success).toBe(true)
      })
    })

    test('valid priority enums', () => {
      const priorities = ['low', 'medium', 'high']
      priorities.forEach(priority => {
        const result = KanbanItemSchema.safeParse({ title: 'test', priority })
        expect(result.success).toBe(true)
      })
    })

    test('empty title rejected', () => {
      const input = {
        title: '',
      }
      const result = KanbanItemSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    test('default values', () => {
      const input = { title: 'test task' }
      const result = KanbanItemSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe('todo')
        expect(result.data.priority).toBe('medium')
      }
    })
  })

  describe('MeetingSchema', () => {
    test('valid meeting request', () => {
      const input = {
        title: 'Team Standup',
        description: 'Daily standup meeting',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T10:30:00Z',
        attendees: ['user1@example.com', 'user2@example.com'],
      }
      const result = MeetingSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    test('attendees email validation', () => {
      const input = {
        title: 'Meeting',
        attendees: ['user1@example.com', 'invalid-email'],
      }
      const result = MeetingSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    test('minimum one attendee required', () => {
      const input = {
        title: 'Meeting',
        attendees: [],
      }
      const result = MeetingSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    test('ISO 8601 datetime validation', () => {
      const inputs = [
        { time: '2024-01-15T10:00:00Z', valid: true },
        { time: '2024-01-15T10:00:00', valid: true },
        { time: '01/15/2024', valid: false },
      ]
      inputs.forEach(({ time, valid }) => {
        const result = MeetingSchema.safeParse({ title: 'test', startTime: time })
        expect(result.success).toBe(valid)
      })
    })
  })

  describe('ProfileUpdateSchema', () => {
    test('valid profile update', () => {
      const input = {
        name: 'John Doe',
        email: 'john@example.com',
        role: 'admin',
        preferences: { theme: 'dark', notifications: true },
      }
      const result = ProfileUpdateSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    test('valid role enums', () => {
      const roles = ['user', 'admin', 'viewer']
      roles.forEach(role => {
        const result = ProfileUpdateSchema.safeParse({ role })
        expect(result.success).toBe(true)
      })
    })

    test('partial update allowed', () => {
      const input = {
        name: 'John Doe',
      }
      const result = ProfileUpdateSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    test('empty update allowed', () => {
      const input = {}
      const result = ProfileUpdateSchema.safeParse(input)
      expect(result.success).toBe(true)
    })
  })

  describe('AlertSchema', () => {
    test('valid alert', () => {
      const input = {
        title: 'Database connection failed',
        message: 'Unable to connect to primary database',
        severity: 'critical',
        tags: ['database', 'critical'],
      }
      const result = AlertSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    test('valid severity enums', () => {
      const severities = ['info', 'warning', 'error', 'critical']
      severities.forEach(severity => {
        const result = AlertSchema.safeParse({ title: 'test', message: 'test', severity })
        expect(result.success).toBe(true)
      })
    })

    test('maximum tags limit', () => {
      const input = {
        title: 'test',
        message: 'test',
        tags: Array(11).fill('tag'),
      }
      const result = AlertSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    test('default severity', () => {
      const input = {
        title: 'Test alert',
        message: 'Test message',
      }
      const result = AlertSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.severity).toBe('info')
      }
    })
  })
})

describe('Security - XSS Prevention', () => {
  test('script tags blocked in conductor message', () => {
    const input = {
      message: 'Normal message with <script>alert("xss")</script>',
    }
    const result = ConductorRequestSchemaComprehensive.safeParse(input)
    expect(result.success).toBe(false)
  })

  test('javascript: protocol blocked', () => {
    const input = {
      message: 'Click here: javascript:alert("xss")',
    }
    const result = ConductorRequestSchemaComprehensive.safeParse(input)
    expect(result.success).toBe(false)
  })

  test('valid markdown-like content allowed', () => {
    const input = {
      message: 'Please **bold** this and create a [link](http://example.com)',
    }
    const result = ConductorRequestSchemaComprehensive.safeParse(input)
    expect(result.success).toBe(true)
  })
})

describe('Type Inference', () => {
  test('LoginRequest type inference', () => {
    type LoginRequest = z.infer<typeof LoginRequestSchema>
    const data: LoginRequest = {
      email: 'user@example.com',
      password: 'ValidPass@123',
    }
    expect(data.email).toBeDefined()
    expect(data.password).toBeDefined()
  })

  test('AlertSchema type inference', () => {
    type AlertInput = z.infer<typeof AlertSchema>
    const data: AlertInput = {
      title: 'Test',
      message: 'Test message',
      severity: 'critical',
      tags: ['test'],
    }
    expect(data).toBeDefined()
  })
})
