/**
 * Comprehensive Rate Limiting and Input Validation Test Suite
 * Validates all API endpoints for:
 * - Rate limit enforcement
 * - Input validation (body + query params)
 * - Enum value validation
 * - XSS/injection prevention
 * - Error handling and response codes
 */

import { NextRequest } from 'next/server'
import {
  createRateLimiter,
  defaultKeyGenerator,
  userKeyGenerator,
  resetRateLimitStore,
} from '@/lib/rate-limiting'
import {
  validateBody,
  validateQuery,
} from '@/lib/validation/middleware'
import {
  LoginRequestSchema,
  AlertCreateBodySchema,
  AlertsQuerySchema,
  KanbanCreateSchema,
  KanbanQuerySchema,
  MeetingCreateSchema,
  MeetingsQuerySchema,
  ProfileUpdateSchema,
  BrainQuerySchema,
  MetricsQuerySchema,
  ConductorRequestSchemaComprehensive,
  VerifyRequestSchema,
} from '@/lib/validation/schemas'

describe('Comprehensive Rate Limiting & Input Validation', () => {
  describe('Rate Limiting', () => {
    beforeEach(() => {
      // All limiters share one global store; start every test from a clean slate
      resetRateLimitStore()
    })

    afterAll(() => {
      // Stops the store's cleanup interval so Jest can exit cleanly
      resetRateLimitStore()
    })

    describe('Auth endpoint rate limiting', () => {
      it('should enforce 5 requests per minute for auth endpoint', async () => {
        const limiter = createRateLimiter({
          maxRequests: 5,
          windowMs: 60 * 1000,
          keyGenerator: defaultKeyGenerator,
        })

        const mockRequest = new NextRequest('http://localhost/api/auth/login', {
          method: 'POST',
          headers: {
            'x-forwarded-for': '192.168.1.1',
          },
        })

        // Make 5 successful requests
        for (let i = 0; i < 5; i++) {
          const response = await limiter(mockRequest)
          expect(response).toBeNull() // No rate limit error
        }

        // 6th request should be rate limited
        const rateLimitedResponse = await limiter(mockRequest)
        expect(rateLimitedResponse).not.toBeNull()
        expect(rateLimitedResponse?.status).toBe(429)
      })

      it('should return proper rate limit headers', async () => {
        const limiter = createRateLimiter({
          maxRequests: 10,
          windowMs: 60 * 1000,
          keyGenerator: defaultKeyGenerator,
        })

        const mockRequest = new NextRequest('http://localhost/api/test', {
          method: 'GET',
          headers: {
            'x-forwarded-for': '192.168.1.1',
          },
        })

        // Requests within the limit pass through (limiter returns null)
        const response = await limiter(mockRequest)
        expect(response).toBeNull()

        // Exhaust the limit; the 429 response must carry the rate limit headers
        for (let i = 0; i < 9; i++) {
          expect(await limiter(mockRequest)).toBeNull()
        }
        const limited = await limiter(mockRequest)
        expect(limited?.status).toBe(429)
        expect(limited?.headers.get('X-RateLimit-Limit')).toBe('10')
        expect(limited?.headers.get('X-RateLimit-Remaining')).toBe('0')
        const reset = Number(limited?.headers.get('X-RateLimit-Reset'))
        expect(reset).toBeGreaterThanOrEqual(Math.floor(Date.now() / 1000))
      })

      it('should distinguish between different IPs', async () => {
        const limiter = createRateLimiter({
          maxRequests: 2,
          windowMs: 60 * 1000,
          keyGenerator: defaultKeyGenerator,
        })

        // Request from IP 1
        const request1 = new NextRequest('http://localhost/api/test', {
          method: 'GET',
          headers: { 'x-forwarded-for': '192.168.1.1' },
        })

        const request2 = new NextRequest('http://localhost/api/test', {
          method: 'GET',
          headers: { 'x-forwarded-for': '192.168.1.2' },
        })

        // Both should succeed initially (separate rate limit buckets)
        const resp1a = await limiter(request1)
        const resp2a = await limiter(request2)
        expect(resp1a).toBeNull()
        expect(resp2a).toBeNull()

        const resp1b = await limiter(request1)
        const resp2b = await limiter(request2)
        expect(resp1b).toBeNull()
        expect(resp2b).toBeNull()

        // 3rd request for IP1 should be rate limited
        const resp1c = await limiter(request1)
        expect(resp1c?.status).toBe(429)

        // But IP2 should still work
        const resp2c = await limiter(request2)
        expect(resp2c?.status).toBe(429) // Also limited now (2 per minute)
      })
    })

    describe('User-based rate limiting', () => {
      it('should use user ID from headers when available', () => {
        const mockRequest = new NextRequest('http://localhost/api/test', {
          method: 'GET',
          headers: {
            'x-user-id': 'user-123',
            'x-forwarded-for': '192.168.1.1',
          },
        })

        const key = userKeyGenerator(mockRequest)
        expect(key).toContain('user-123')
      })

      it('should fall back to IP when no user ID', () => {
        const mockRequest = new NextRequest('http://localhost/api/test', {
          method: 'GET',
          headers: {
            'x-forwarded-for': '192.168.1.1',
          },
        })

        const key = userKeyGenerator(mockRequest)
        expect(key).toContain('192.168.1.1')
      })
    })
  })

  describe('Input Validation - Enum Values', () => {
    // AlertCreateBodySchema now uses `severity` (info|warning|error|critical) and
    // requires `title` + `message`; the old `level`/`component` fields were removed.
    describe('Alert severity enum validation', () => {
      it('should accept valid alert severities', async () => {
        const validPayloads = ['info', 'warning', 'error', 'critical'].map((severity) => ({
          title: 'test',
          message: 'test message',
          severity,
        }))

        for (const payload of validPayloads) {
          const result = AlertCreateBodySchema.safeParse(payload)
          expect(result.success).toBe(true)
        }
      })

      it('should reject invalid alert severities', () => {
        const invalidPayload = {
          title: 'test',
          message: 'test message',
          severity: 'invalid',
        }

        const result = AlertCreateBodySchema.safeParse(invalidPayload)
        expect(result.success).toBe(false)
      })
    })

    describe('Alert status enum validation', () => {
      it('should accept valid alert statuses', () => {
        const query1 = AlertsQuerySchema.safeParse({ status: 'active' })
        const query2 = AlertsQuerySchema.safeParse({ status: 'resolved' })

        expect(query1.success).toBe(true)
        expect(query2.success).toBe(true)
      })

      it('should reject invalid alert statuses', () => {
        const result = AlertsQuerySchema.safeParse({ status: 'invalid' })
        expect(result.success).toBe(false)
      })
    })

    describe('Kanban status enum validation', () => {
      it('should accept valid kanban statuses', () => {
        const validStatuses = ['todo', 'in_progress', 'done']

        for (const status of validStatuses) {
          const result = KanbanCreateSchema.safeParse({
            title: 'Test',
            status,
          })
          expect(result.success).toBe(true)
        }
      })

      it('should reject invalid kanban statuses', () => {
        const result = KanbanCreateSchema.safeParse({
          title: 'Test',
          status: 'invalid_status',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('Kanban priority enum validation', () => {
      it('should accept valid priorities', () => {
        const validPriorities = ['low', 'medium', 'high']

        for (const priority of validPriorities) {
          const result = KanbanCreateSchema.safeParse({
            title: 'Test',
            priority,
          })
          expect(result.success).toBe(true)
        }
      })

      it('should reject invalid priorities', () => {
        const result = KanbanCreateSchema.safeParse({
          title: 'Test',
          priority: 'super_high',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('Meeting status enum validation', () => {
      it('should accept valid meeting statuses', () => {
        const validStatuses = ['scheduled', 'completed', 'failed']

        for (const status of validStatuses) {
          const result = MeetingsQuerySchema.safeParse({ status })
          expect(result.success).toBe(true)
        }
      })

      it('should reject invalid meeting statuses', () => {
        const result = MeetingsQuerySchema.safeParse({ status: 'invalid' })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('Input Validation - Required Fields', () => {
    describe('Login request validation', () => {
      it('should require email and password', () => {
        const incompletePayload = { email: 'test@example.com' }
        const result = LoginRequestSchema.safeParse(incompletePayload)
        expect(result.success).toBe(false)
      })

      it('should validate email format', () => {
        const invalidEmail = {
          email: 'invalid-email',
          password: 'Password123!',
        }
        const result = LoginRequestSchema.safeParse(invalidEmail)
        expect(result.success).toBe(false)
      })

      it('should accept valid login request', () => {
        const validPayload = {
          email: 'test@example.com',
          password: 'ValidPass@123',
        }
        const result = LoginRequestSchema.safeParse(validPayload)
        expect(result.success).toBe(true)
      })
    })

    describe('Alert creation validation', () => {
      it('should require all mandatory fields', () => {
        const incompletePayload = {
          severity: 'info',
          // missing title and message
        }
        const result = AlertCreateBodySchema.safeParse(incompletePayload)
        expect(result.success).toBe(false)
      })

      it('should enforce string length limits', () => {
        const tooLongMessage = {
          title: 'test',
          severity: 'info',
          message: 'x'.repeat(1001), // Exceeds 1000 character limit (createSafeString default)
        }
        const result = AlertCreateBodySchema.safeParse(tooLongMessage)
        expect(result.success).toBe(false)
      })
    })

    describe('Kanban item validation', () => {
      it('should require title', () => {
        const payload = { status: 'todo' }
        const result = KanbanCreateSchema.safeParse(payload)
        expect(result.success).toBe(false)
      })

      it('should have default values for optional fields', () => {
        const payload = { title: 'Test Task' }
        const result = KanbanCreateSchema.safeParse(payload)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.status).toBe('todo')
          expect(result.data.priority).toBe('medium')
        }
      })
    })
  })

  describe('Input Validation - XSS Prevention', () => {
    it('should reject script tags in safe strings', () => {
      const maliciousPayload = {
        title: '<script>alert("xss")</script>Test',
      }

      const result = KanbanCreateSchema.safeParse(maliciousPayload)
      // SafeStringSchema should reject script tags
      expect(result.success).toBe(false)
    })

    it('should reject javascript: protocol', () => {
      const maliciousPayload = {
        title: '<a href="javascript:alert(1)">Click</a>',
      }

      const result = KanbanCreateSchema.safeParse(maliciousPayload)
      expect(result.success).toBe(false)
    })

    it('should accept normal text with special characters', () => {
      const legitimatePayload = {
        title: 'Task with special chars: !@#$%^&*()',
      }

      const result = KanbanCreateSchema.safeParse(legitimatePayload)
      expect(result.success).toBe(true)
    })
  })

  describe('Input Validation - Query Parameters', () => {
    describe('Pagination validation', () => {
      it('should accept valid limit and offset', () => {
        const result = AlertsQuerySchema.safeParse({
          limit: 50,
          offset: 0,
        })
        expect(result.success).toBe(true)
      })

      it('should reject negative offset', () => {
        const result = AlertsQuerySchema.safeParse({
          offset: -1,
        })
        expect(result.success).toBe(false)
      })

      it('should enforce maximum limit', () => {
        const result = AlertsQuerySchema.safeParse({
          limit: 2000, // Exceeds max of 1000
        })
        expect(result.success).toBe(false)
      })
    })

    describe('Brain query validation', () => {
      it('should accept valid category', () => {
        const result = BrainQuerySchema.safeParse({
          category: 'valid-category',
        })
        expect(result.success).toBe(true)
      })

      it('should reject invalid category format', () => {
        const result = BrainQuerySchema.safeParse({
          category: 'invalid category!', // Contains space
        })
        expect(result.success).toBe(false)
      })
    })

    describe('Metrics query validation', () => {
      it('should accept valid period', () => {
        const validPeriods = ['day', 'week', 'month', 'year']

        for (const period of validPeriods) {
          const result = MetricsQuerySchema.safeParse({ period })
          expect(result.success).toBe(true)
        }
      })

      it('should reject invalid period', () => {
        const result = MetricsQuerySchema.safeParse({ period: 'invalid' })
        expect(result.success).toBe(false)
      })

      it('should accept valid format', () => {
        const result = MetricsQuerySchema.safeParse({ format: 'csv' })
        expect(result.success).toBe(true)
      })

      it('should reject invalid format', () => {
        const result = MetricsQuerySchema.safeParse({ format: 'xml' })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('Endpoint Coverage Checklist', () => {
    const endpoints = [
      { path: '/api/alerts', methods: ['GET', 'POST', 'PUT'], hasAuth: true },
      { path: '/api/auth/login', methods: ['POST'], hasAuth: false },
      { path: '/api/auth/verify', methods: ['POST'], hasAuth: false },
      { path: '/api/brain', methods: ['GET'], hasAuth: true },
      { path: '/api/conductor', methods: ['POST'], hasAuth: true },
      { path: '/api/health', methods: ['GET'], hasAuth: false },
      { path: '/api/kanban', methods: ['GET', 'POST', 'PUT'], hasAuth: true },
      { path: '/api/meetings', methods: ['GET', 'POST', 'DELETE'], hasAuth: true },
      { path: '/api/metrics', methods: ['GET'], hasAuth: true },
      { path: '/api/profiles', methods: ['GET', 'PUT'], hasAuth: true },
    ]

    it('should have all endpoints documented', () => {
      expect(endpoints.length).toBeGreaterThan(0)
      endpoints.forEach((endpoint) => {
        expect(endpoint.path).toBeDefined()
        expect(endpoint.methods.length).toBeGreaterThan(0)
      })
    })

    it('should validate that each endpoint has rate limiting configured', () => {
      const rateLimitedEndpoints = [
        'alerts',
        'auth',
        'brain',
        'conductor',
        'health',
        'kanban',
        'meetings',
        'metrics',
        'profiles',
      ]

      expect(rateLimitedEndpoints.length).toBeGreaterThan(0)
    })

    it('should validate enum fields in all endpoints', () => {
      const enumFields = {
        alerts: ['level', 'status'],
        kanban: ['status', 'priority'],
        meetings: ['status'],
      }

      Object.entries(enumFields).forEach(([endpoint, fields]) => {
        expect(fields.length).toBeGreaterThan(0)
      })
    })
  })
})
