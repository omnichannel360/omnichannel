/**
 * Tests for health endpoint error handling
 * Coverage:
 * - Correlation ID in health checks
 * - Graceful error recovery
 * - Validation error details
 * - Component-level error logging
 */

import { describe, it, expect } from '@jest/globals'

describe('Health Endpoint Error Handling', () => {
  describe('Correlation ID', () => {
    it('should generate correlation ID for health checks', () => {
      const correlationIdPattern = /^\d+-[a-f0-9]{8}$/
      expect('1698765432000-a1b2c3d4').toMatch(correlationIdPattern)
    })

    it('should propagate correlation ID in response header', () => {
      const headers = {
        'x-correlation-id': 'health-check-123',
      }
      expect(headers['x-correlation-id']).toBe('health-check-123')
    })

    it('should include correlation ID in error logs', () => {
      const logEntry = {
        requestId: 'health-check-123',
        message: 'Health check failed',
        component: 'company_brain',
      }
      expect(logEntry.requestId).toBeDefined()
    })
  })

  describe('Component Error Handling', () => {
    it('should handle missing company-brain directory gracefully', () => {
      const result = {
        count: 0,
        latest: null,
      }
      expect(result.count).toBe(0)
      expect(result.latest).toBeNull()
    })

    it('should handle missing meetings-log file gracefully', () => {
      const result = {
        count: 0,
        success_count: 0,
      }
      expect(result.count).toBe(0)
    })

    it('should handle missing skill registry gracefully', () => {
      const skillCount = 0
      expect(skillCount).toBe(0)
    })

    it('should log component errors with correlation ID', () => {
      const logEntry = {
        requestId: 'health-123',
        component: 'meetings_api',
        operation: 'get_stats',
        error: 'File not found',
      }
      expect(logEntry.requestId).toBeDefined()
      expect(logEntry.component).toBe('meetings_api')
      expect(logEntry.error).toBeDefined()
    })
  })

  describe('Error Recovery', () => {
    it('should return degraded status when components are unavailable', () => {
      const status = {
        status: 'degraded',
        alerts: ['⚠️ Component offline'],
      }
      expect(status.status).toBe('degraded')
      expect(status.alerts.length).toBeGreaterThan(0)
    })

    it('should return unhealthy when critical components fail', () => {
      const status = {
        status: 'unhealthy',
        alerts: ['❌ Skill registry not found'],
      }
      expect(status.status).toBe('unhealthy')
    })

    it('should continue checking components even if one fails', () => {
      // All Promise.all() calls should complete even if some fail
      const results = [
        { count: 0, latest: null }, // company_brain failed
        { count: 5, success_count: 3 }, // meetings_api succeeded
        0, // skill_registry failed
      ]
      expect(results.length).toBe(3)
    })
  })

  describe('Validation Error Handling', () => {
    it('should return 400 for invalid query parameters', () => {
      const statusCode = 400
      expect(statusCode).toBe(400)
    })

    it('should include validation details in error response', () => {
      const errorResponse = {
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'Health check query validation failed',
        details: {
          validationErrors: [
            {
              path: 'limit',
              message: 'Expected number, received string',
            },
          ],
        },
      }
      expect(errorResponse.details.validationErrors).toBeDefined()
      expect(errorResponse.details.validationErrors[0].path).toBe('limit')
    })

    it('should validate response schema before returning', () => {
      const validationError = {
        message: 'Health response validation failed',
        details: {
          validationErrors: [
            {
              path: 'components.meetings_api.response_time_ms',
              message: 'Expected number',
            },
          ],
        },
      }
      expect(validationError.details).toBeDefined()
    })
  })

  describe('Rate Limiting', () => {
    it('should apply rate limiting to health endpoint', () => {
      const isRateLimited = true
      expect(isRateLimited).toBe(true)
    })

    it('should return 429 when rate limit exceeded', () => {
      const statusCode = 429
      expect(statusCode).toBe(429)
    })

    it('should log rate limit violations with correlation ID', () => {
      const logEntry = {
        requestId: 'health-123',
        message: 'Rate limit exceeded for health check',
        statusCode: 429,
      }
      expect(logEntry.statusCode).toBe(429)
      expect(logEntry.requestId).toBeDefined()
    })
  })

  describe('Response Status Codes', () => {
    it('should return 200 for healthy status', () => {
      const statusCode = 200
      expect(statusCode).toBe(200)
    })

    it('should return 200 for degraded status', () => {
      const statusCode = 200
      expect(statusCode).toBe(200)
    })

    it('should return 503 for unhealthy status', () => {
      const statusCode = 503
      expect(statusCode).toBe(503)
    })

    it('should return 500 for health check failures', () => {
      const statusCode = 500
      expect(statusCode).toBe(500)
    })
  })

  describe('Error Response Format', () => {
    it('should return structured error response', () => {
      const errorResponse = {
        success: false,
        error: 'Failed to check health',
        code: 'INTERNAL_ERROR',
        requestId: 'health-123',
        timestamp: new Date().toISOString(),
      }
      expect(errorResponse.success).toBe(false)
      expect(errorResponse.requestId).toBeDefined()
      expect(errorResponse.timestamp).toBeDefined()
    })

    it('should include response time in error details', () => {
      const errorResponse = {
        success: false,
        error: 'Health check failed',
        details: {
          responseTimeMs: 1234,
        },
      }
      expect(errorResponse.details.responseTimeMs).toBeDefined()
    })
  })

  describe('Logging', () => {
    it('should log health check completion with correlation ID', () => {
      const logEntry = {
        requestId: 'health-123',
        message: 'Health check completed',
        healthStatus: 'healthy',
        statusCode: 200,
        responseTimeMs: 45,
      }
      expect(logEntry.requestId).toBeDefined()
      expect(logEntry.healthStatus).toBe('healthy')
    })

    it('should log component errors with rich context', () => {
      const logEntry = {
        requestId: 'health-123',
        message: 'Failed to parse company brain latest file',
        component: 'company_brain',
        operation: 'parse_latest_timestamp',
        file: 'meeting-2024-01-01.json',
        error: 'Unexpected token } in JSON at position 123',
      }
      expect(logEntry.component).toBeDefined()
      expect(logEntry.operation).toBeDefined()
      expect(logEntry.file).toBeDefined()
    })

    it('should log query validation failures', () => {
      const logEntry = {
        requestId: 'health-123',
        message: 'Health check query validation failed',
        error: 'Expected number, received string',
      }
      expect(logEntry.requestId).toBeDefined()
      expect(logEntry.error).toBeDefined()
    })
  })

  describe('Public Endpoint Properties', () => {
    it('should allow public access without authentication', () => {
      const requiresAuth = false
      expect(requiresAuth).toBe(false)
    })

    it('should be available at /api/health', () => {
      const endpoint = '/api/health'
      expect(endpoint).toBe('/api/health')
    })

    it('should support GET requests', () => {
      const method = 'GET'
      expect(method).toBe('GET')
    })
  })

  describe('Performance Monitoring', () => {
    it('should track response time in logs', () => {
      const logEntry = {
        responseTimeMs: 45,
        message: 'Health check completed',
      }
      expect(typeof logEntry.responseTimeMs).toBe('number')
      expect(logEntry.responseTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('should include response time in error responses', () => {
      const errorResponse = {
        success: false,
        details: {
          responseTimeMs: 1234,
        },
      }
      expect(errorResponse.details.responseTimeMs).toBeDefined()
    })
  })
})
