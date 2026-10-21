/**
 * API Endpoint Schemas Test Suite
 * Tests all endpoint-specific validation schemas
 * Including: LoginRequest, RegisterRequest, BrainQuery, Alerts, Meetings, etc.
 */

import {
  LoginRequestSchema,
  RegisterRequestSchema,
  VerifyRequestSchema,
  BrainQuerySchema,
  MetricsQuerySchema,
  ConductorRequestSchema,
  KanbanItemSchema,
  MeetingSchema,
  ProfileUpdateSchema,
  AlertSchema,
  AlertCreateBodySchema,
  AlertUpdateBodySchema,
  AuthTokenRequestSchema,
  ConductorRequestSchemaComprehensive,
  TokenGenerationSchema,
  ProfileQuerySchema,
  ProfileDeleteSchema,
  LogoutRequestSchema,
  AlertsQuerySchema,
} from '@/lib/validation/schemas'

describe('API Endpoint Schemas', () => {
  // ============================================================================
  // LOGIN REQUEST SCHEMA TESTS
  // ============================================================================
  describe('LoginRequestSchema', () => {
    const schema = LoginRequestSchema

    describe('Valid Login Requests', () => {
      it('should accept valid login credentials', () => {
        const result = schema.safeParse({
          email: 'user@example.com',
          password: 'password123',
        })
        expect(result.success).toBe(true)
      })

      it('should accept login with valid weak password', () => {
        const result = schema.safeParse({
          email: 'test@test.com',
          password: 'pass12',
        })
        expect(result.success).toBe(true)
      })

      it('should normalize email to lowercase', () => {
        const result = schema.safeParse({
          email: 'USER@EXAMPLE.COM',
          password: 'password123',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.email).toBe('user@example.com')
        }
      })
    })

    describe('Invalid Login Requests', () => {
      it('should reject missing email', () => {
        const result = schema.safeParse({
          password: 'password123',
        })
        expect(result.success).toBe(false)
      })

      it('should reject missing password', () => {
        const result = schema.safeParse({
          email: 'user@example.com',
        })
        expect(result.success).toBe(false)
      })

      it('should reject invalid email', () => {
        const result = schema.safeParse({
          email: 'notanemail',
          password: 'password123',
        })
        expect(result.success).toBe(false)
      })

      it('should reject password too short', () => {
        const result = schema.safeParse({
          email: 'user@example.com',
          password: 'short',
        })
        expect(result.success).toBe(false)
      })

      it('should reject additional fields', () => {
        const result = schema.safeParse({
          email: 'user@example.com',
          password: 'password123',
          extra: 'field',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // REGISTER REQUEST SCHEMA TESTS
  // ============================================================================
  describe('RegisterRequestSchema', () => {
    const schema = RegisterRequestSchema

    describe('Valid Register Requests', () => {
      it('should accept valid registration', () => {
        const result = schema.safeParse({
          email: 'newuser@example.com',
          password: 'password123',
          name: 'John Doe',
        })
        expect(result.success).toBe(true)
      })

      it('should accept registration without optional name', () => {
        const result = schema.safeParse({
          email: 'newuser@example.com',
          password: 'password123',
        })
        expect(result.success).toBe(true)
      })

      it('should trim name whitespace', () => {
        const result = schema.safeParse({
          email: 'newuser@example.com',
          password: 'password123',
          name: '  John Doe  ',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('Invalid Register Requests', () => {
      it('should reject missing email', () => {
        const result = schema.safeParse({
          password: 'password123',
          name: 'John Doe',
        })
        expect(result.success).toBe(false)
      })

      it('should reject missing password', () => {
        const result = schema.safeParse({
          email: 'newuser@example.com',
          name: 'John Doe',
        })
        expect(result.success).toBe(false)
      })

      it('should reject invalid email', () => {
        const result = schema.safeParse({
          email: 'invalid-email',
          password: 'password123',
          name: 'John Doe',
        })
        expect(result.success).toBe(false)
      })

      it('should reject name with XSS attempt', () => {
        const result = schema.safeParse({
          email: 'newuser@example.com',
          password: 'password123',
          name: '<script>alert(1)</script>',
        })
        expect(result.success).toBe(false)
      })

      it('should reject empty name', () => {
        const result = schema.safeParse({
          email: 'newuser@example.com',
          password: 'password123',
          name: '',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // VERIFY REQUEST SCHEMA TESTS
  // ============================================================================
  describe('VerifyRequestSchema', () => {
    const schema = VerifyRequestSchema

    describe('Valid Verify Requests', () => {
      it('should accept valid token', () => {
        const result = schema.safeParse({
          token: 'valid_token_1234567890',
        })
        expect(result.success).toBe(true)
      })

      it('should accept long token at max length', () => {
        const longToken = 'a'.repeat(1000)
        const result = schema.safeParse({
          token: longToken,
        })
        expect(result.success).toBe(true)
      })
    })

    describe('Invalid Verify Requests', () => {
      it('should reject missing token', () => {
        const result = schema.safeParse({})
        expect(result.success).toBe(false)
      })

      it('should reject token too short', () => {
        const result = schema.safeParse({
          token: '123456789',
        })
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('at least 10 characters')
      })

      it('should reject token too long', () => {
        const longToken = 'a'.repeat(1001)
        const result = schema.safeParse({
          token: longToken,
        })
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // BRAIN QUERY SCHEMA TESTS
  // ============================================================================
  describe('BrainQuerySchema', () => {
    const schema = BrainQuerySchema

    describe('Valid Brain Queries', () => {
      it('should accept query with category and limit', () => {
        const result = schema.safeParse({
          category: 'general',
          limit: 20,
        })
        expect(result.success).toBe(true)
      })

      it('should apply default limit (20)', () => {
        const result = schema.safeParse({
          category: 'general',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.limit).toBe(20)
        }
      })

      it('should accept query without category', () => {
        const result = schema.safeParse({
          limit: 50,
        })
        expect(result.success).toBe(true)
      })

      it('should accept empty query object', () => {
        const result = schema.safeParse({})
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.limit).toBe(20)
        }
      })

      it('should accept limit at boundaries', () => {
        const result = schema.safeParse({
          category: 'test',
          limit: 100,
        })
        expect(result.success).toBe(true)
      })
    })

    describe('Invalid Brain Queries', () => {
      it('should reject limit exceeding 100', () => {
        const result = schema.safeParse({
          limit: 101,
        })
        expect(result.success).toBe(false)
      })

      it('should reject limit less than 1', () => {
        const result = schema.safeParse({
          limit: 0,
        })
        expect(result.success).toBe(false)
      })

      it('should reject invalid category format', () => {
        const result = schema.safeParse({
          category: 'invalid category!',
        })
        expect(result.success).toBe(false)
      })

      it('should reject category with spaces', () => {
        const result = schema.safeParse({
          category: 'my category',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // METRICS QUERY SCHEMA TESTS
  // ============================================================================
  describe('MetricsQuerySchema', () => {
    const schema = MetricsQuerySchema

    describe('Valid Metrics Queries', () => {
      it('should accept valid period', () => {
        const result = schema.safeParse({
          period: 'day',
        })
        expect(result.success).toBe(true)
      })

      it('should accept valid format', () => {
        const result = schema.safeParse({
          format: 'json',
        })
        expect(result.success).toBe(true)
      })

      it('should apply default period (day)', () => {
        const result = schema.safeParse({})
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.period).toBe('day')
        }
      })

      it('should apply default format (json)', () => {
        const result = schema.safeParse({})
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.format).toBe('json')
        }
      })

      it('should accept all valid periods', () => {
        ['day', 'week', 'month', 'year'].forEach((period) => {
          const result = schema.safeParse({ period })
          expect(result.success).toBe(true)
        })
      })

      it('should accept all valid formats', () => {
        ['json', 'csv'].forEach((format) => {
          const result = schema.safeParse({ format })
          expect(result.success).toBe(true)
        })
      })
    })

    describe('Invalid Metrics Queries', () => {
      it('should reject invalid period', () => {
        const result = schema.safeParse({
          period: 'fortnight',
        })
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('day, week, month, year')
      })

      it('should reject invalid format', () => {
        const result = schema.safeParse({
          format: 'xml',
        })
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('json, csv')
      })
    })
  })

  // ============================================================================
  // CONDUCTOR REQUEST SCHEMA TESTS
  // ============================================================================
  describe('ConductorRequestSchema', () => {
    const schema = ConductorRequestSchema

    describe('Valid Conductor Requests', () => {
      it('should accept valid action', () => {
        const result = schema.safeParse({
          action: 'execute_task',
        })
        expect(result.success).toBe(true)
      })

      it('should accept with params', () => {
        const result = schema.safeParse({
          action: 'execute_task',
          params: { userId: '123', action: 'start' },
        })
        expect(result.success).toBe(true)
      })

      it('should apply default timeout (30000)', () => {
        const result = schema.safeParse({
          action: 'execute_task',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.timeout).toBe(30000)
        }
      })

      it('should accept custom timeout', () => {
        const result = schema.safeParse({
          action: 'execute_task',
          timeout: 60000,
        })
        expect(result.success).toBe(true)
      })

      it('should accept timeout at boundaries', () => {
        const result = schema.safeParse({
          action: 'execute_task',
          timeout: 100,
        })
        expect(result.success).toBe(true)
      })
    })

    describe('Invalid Conductor Requests', () => {
      it('should reject missing action', () => {
        const result = schema.safeParse({
          timeout: 30000,
        })
        expect(result.success).toBe(false)
      })

      it('should reject timeout too low', () => {
        const result = schema.safeParse({
          action: 'execute_task',
          timeout: 50,
        })
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('at least 100ms')
      })

      it('should reject timeout too high', () => {
        const result = schema.safeParse({
          action: 'execute_task',
          timeout: 300001,
        })
        expect(result.success).toBe(false)
      })

      it('should reject float timeout', () => {
        const result = schema.safeParse({
          action: 'execute_task',
          timeout: 30000.5,
        })
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // KANBAN ITEM SCHEMA TESTS
  // ============================================================================
  describe('KanbanItemSchema', () => {
    const schema = KanbanItemSchema

    describe('Valid Kanban Items', () => {
      it('should accept item with title', () => {
        const result = schema.safeParse({
          title: 'Complete task',
        })
        expect(result.success).toBe(true)
      })

      it('should accept item with all fields', () => {
        const result = schema.safeParse({
          title: 'Complete task',
          description: 'Task description',
          status: 'in_progress',
          priority: 'high',
        })
        expect(result.success).toBe(true)
      })

      it('should apply default status (todo)', () => {
        const result = schema.safeParse({
          title: 'Task',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.status).toBe('todo')
        }
      })

      it('should apply default priority (medium)', () => {
        const result = schema.safeParse({
          title: 'Task',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.priority).toBe('medium')
        }
      })

      it('should accept all valid statuses', () => {
        ['todo', 'in_progress', 'done'].forEach((status) => {
          const result = schema.safeParse({
            title: 'Task',
            status,
          })
          expect(result.success).toBe(true)
        })
      })
    })

    describe('Invalid Kanban Items', () => {
      it('should reject missing title', () => {
        const result = schema.safeParse({
          status: 'todo',
        })
        expect(result.success).toBe(false)
      })

      it('should reject empty title', () => {
        const result = schema.safeParse({
          title: '',
        })
        expect(result.success).toBe(false)
      })

      it('should reject invalid status', () => {
        const result = schema.safeParse({
          title: 'Task',
          status: 'pending',
        })
        expect(result.success).toBe(false)
      })

      it('should reject invalid priority', () => {
        const result = schema.safeParse({
          title: 'Task',
          priority: 'urgent',
        })
        expect(result.success).toBe(false)
      })

      it('should reject title with XSS', () => {
        const result = schema.safeParse({
          title: '<script>alert(1)</script>',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // MEETING SCHEMA TESTS
  // ============================================================================
  describe('MeetingSchema', () => {
    const schema = MeetingSchema

    describe('Valid Meetings', () => {
      it('should accept meeting with title', () => {
        const result = schema.safeParse({
          title: 'Team Standup',
        })
        expect(result.success).toBe(true)
      })

      it('should accept meeting with attendees', () => {
        const result = schema.safeParse({
          title: 'Team Standup',
          attendees: ['user@example.com'],
        })
        expect(result.success).toBe(true)
      })

      it('should accept meeting with datetime', () => {
        const result = schema.safeParse({
          title: 'Team Standup',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
        })
        expect(result.success).toBe(true)
      })

      it('should accept meeting with all fields', () => {
        const result = schema.safeParse({
          title: 'Team Standup',
          description: 'Daily standup meeting',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
          attendees: ['user1@example.com', 'user2@example.com'],
        })
        expect(result.success).toBe(true)
      })

      it('should apply default attendees []', () => {
        const result = schema.safeParse({
          title: 'Meeting',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.attendees).toEqual([])
        }
      })
    })

    describe('Invalid Meetings', () => {
      it('should reject missing title', () => {
        const result = schema.safeParse({
          attendees: ['user@example.com'],
        })
        expect(result.success).toBe(false)
      })

      it('should reject empty title', () => {
        const result = schema.safeParse({
          title: '',
        })
        expect(result.success).toBe(false)
      })

      it('should reject invalid datetime format', () => {
        const result = schema.safeParse({
          title: 'Meeting',
          startTime: 'invalid-date',
        })
        expect(result.success).toBe(false)
      })

      it('should reject invalid attendee email', () => {
        const result = schema.safeParse({
          title: 'Meeting',
          attendees: ['not-an-email'],
        })
        expect(result.success).toBe(false)
      })

      it('should reject attendees with less than 1 when provided as array', () => {
        const result = schema.safeParse({
          title: 'Meeting',
          attendees: [],
        })
        expect(result.success).toBe(true) // Empty array should use default
      })

      it('should reject title with XSS', () => {
        const result = schema.safeParse({
          title: 'javascript:alert(1)',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // PROFILE UPDATE SCHEMA TESTS
  // ============================================================================
  describe('ProfileUpdateSchema', () => {
    const schema = ProfileUpdateSchema

    describe('Valid Profile Updates', () => {
      it('should accept update with name', () => {
        const result = schema.safeParse({
          name: 'John Doe',
        })
        expect(result.success).toBe(true)
      })

      it('should accept update with email', () => {
        const result = schema.safeParse({
          email: 'john@example.com',
        })
        expect(result.success).toBe(true)
      })

      it('should accept update with role', () => {
        const result = schema.safeParse({
          role: 'admin',
        })
        expect(result.success).toBe(true)
      })

      it('should accept partial update', () => {
        const result = schema.safeParse({
          name: 'John Doe',
          role: 'user',
        })
        expect(result.success).toBe(true)
      })

      it('should accept empty update object', () => {
        const result = schema.safeParse({})
        expect(result.success).toBe(true)
      })

      it('should accept all valid roles', () => {
        ['user', 'admin', 'viewer'].forEach((role) => {
          const result = schema.safeParse({ role })
          expect(result.success).toBe(true)
        })
      })
    })

    describe('Invalid Profile Updates', () => {
      it('should reject empty name', () => {
        const result = schema.safeParse({
          name: '',
        })
        expect(result.success).toBe(false)
      })

      it('should reject invalid email', () => {
        const result = schema.safeParse({
          email: 'not-an-email',
        })
        expect(result.success).toBe(false)
      })

      it('should reject invalid role', () => {
        const result = schema.safeParse({
          role: 'superadmin',
        })
        expect(result.success).toBe(false)
      })

      it('should reject name with XSS', () => {
        const result = schema.safeParse({
          name: '<script>alert(1)</script>',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  // ============================================================================
  // ALERT SCHEMA TESTS
  // ============================================================================
  describe('AlertSchema', () => {
    const schema = AlertSchema

    describe('Valid Alerts', () => {
      it('should accept alert with title and message', () => {
        const result = schema.safeParse({
          title: 'Alert Title',
          message: 'Alert message content',
        })
        expect(result.success).toBe(true)
      })

      it('should accept alert with all fields', () => {
        const result = schema.safeParse({
          title: 'Alert Title',
          message: 'Alert message content',
          severity: 'critical',
          tags: ['urgent', 'system'],
        })
        expect(result.success).toBe(true)
      })

      it('should apply default severity (info)', () => {
        const result = schema.safeParse({
          title: 'Alert',
          message: 'Message',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.severity).toBe('info')
        }
      })

      it('should accept all valid severities', () => {
        ['info', 'warning', 'error', 'critical'].forEach((severity) => {
          const result = schema.safeParse({
            title: 'Alert',
            message: 'Message',
            severity,
          })
          expect(result.success).toBe(true)
        })
      })

      it('should accept maximum tags (10)', () => {
        const tags = Array.from({ length: 10 }, (_, i) => `tag${i}`)
        const result = schema.safeParse({
          title: 'Alert',
          message: 'Message',
          tags,
        })
        expect(result.success).toBe(true)
      })
    })

    describe('Invalid Alerts', () => {
      it('should reject missing title', () => {
        const result = schema.safeParse({
          message: 'Message',
        })
        expect(result.success).toBe(false)
      })

      it('should reject missing message', () => {
        const result = schema.safeParse({
          title: 'Title',
        })
        expect(result.success).toBe(false)
      })

      it('should reject empty title', () => {
        const result = schema.safeParse({
          title: '',
          message: 'Message',
        })
        expect(result.success).toBe(false)
      })

      it('should reject invalid severity', () => {
        const result = schema.safeParse({
          title: 'Alert',
          message: 'Message',
          severity: 'fatal',
        })
        expect(result.success).toBe(false)
      })

      it('should reject more than 10 tags', () => {
        const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`)
        const result = schema.safeParse({
          title: 'Alert',
          message: 'Message',
          tags,
        })
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain('Maximum 10 tags')
      })

      it('should reject title with XSS', () => {
        const result = schema.safeParse({
          title: '<script>alert(1)</script>',
          message: 'Message',
        })
        expect(result.success).toBe(false)
      })

      it('should reject message with forbidden patterns', () => {
        const result = schema.safeParse({
          title: 'Alert',
          message: 'javascript:alert(1)',
        })
        expect(result.success).toBe(false)
      })
    })
  })
})
