import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { withFileLock } from '@/lib/file-lock'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { HealthStatusResponseSchema, HealthComponentSchema, HealthQuerySchema } from '@/lib/validation'
import { validateQuery } from '@/lib/validation/middleware'
import { createLogger, createLogContext, LogContext } from '@/lib/logger'
import { asyncRoute } from '@/lib/async-route'
import {
  getOrCreateCorrelationId,
  createErrorResponse,
  formatErrorLog,
  ERROR_CODES,
  createSuccessResponse,
  getErrorDetails,
} from '@/lib/error-handling'

const logger = createLogger('health-api')

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  components: {
    meetings_api: { status: string; response_time_ms: number }
    conductor_api: { status: string; response_time_ms: number }
    company_brain: { status: string; log_count: number; latest_timestamp: string | null }
    skill_registry: { status: string; skill_count: number }
  }
  metrics: {
    total_meetings_processed: number
    total_skills_triggered: number
    success_rate: number
    recent_logs: number
  }
  alerts: string[]
}

async function getCompanyBrainStats(correlationId: string): Promise<{ count: number; latest: string | null }> {
  try {
    const brainDir = path.join(process.cwd(), '..', 'company-brain', 'meetings')
    // Note: Removed file-level lock for directory read-only operation.
    // Directory-level locking causes unnecessary serialization of independent file reads.
    // Read-only operations on the directory do not require locking.
    try {
      await fs.stat(brainDir)
    } catch (error) {
      logger.warn('Company brain directory not found', {
        requestId: correlationId,
        component: 'company_brain',
        operation: 'stat_directory',
        path: brainDir,
      })
      return { count: 0, latest: null }
    }

    const files = (await fs.readdir(brainDir)).filter(f => f.endsWith('.json'))
    if (files.length === 0) return { count: 0, latest: null }

    // Safe array operation: sort and pop with null guard
    const sortedFiles = files.sort()
    const latest = sortedFiles[sortedFiles.length - 1]

    let latestTimestamp = null
    if (latest && typeof latest === 'string' && latest.length > 0) {
      try {
        const filePath = path.join(brainDir, latest)
        const content = await fs.readFile(filePath, 'utf-8')
        const parsed = JSON.parse(content)

        // Type-safe access to timestamp field
        if (parsed && typeof parsed === 'object' && 'timestamp' in parsed) {
          latestTimestamp = String(parsed.timestamp)
        }
      } catch (error) {
        logger.warn('Failed to parse company brain latest file', {
          requestId: correlationId,
          component: 'company_brain',
          operation: 'parse_latest_timestamp',
          file: latest,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { count: files.length, latest: latestTimestamp }
  } catch (error) {
    logger.error('Failed to get company brain stats', error, {
      requestId: correlationId,
      component: 'company_brain',
      operation: 'get_stats',
    })
    return { count: 0, latest: null }
  }
}

async function getMeetingsLogStats(correlationId: string): Promise<{ count: number; success_count: number }> {
  const logPath = path.join(process.cwd(), 'data', 'meetings-log.json')
  try {
    return await withFileLock(logPath, async () => {
      try {
        await fs.stat(logPath)
      } catch (error) {
        logger.warn('Meetings log file not found', {
          requestId: correlationId,
          component: 'meetings_api',
          operation: 'stat_file',
          path: logPath,
        })
        return { count: 0, success_count: 0 }
      }

      const content = await fs.readFile(logPath, 'utf-8')
      const logs = JSON.parse(content)
      if (!Array.isArray(logs)) {
        logger.warn('Meetings log is not an array', {
          requestId: correlationId,
          component: 'meetings_api',
          operation: 'parse_log',
          actualType: typeof logs,
        })
        return { count: 0, success_count: 0 }
      }

      interface MeetingLog {
        status: string
        [key: string]: unknown
      }
      const successCount = logs.filter((l: MeetingLog) => l.status === 'scheduled').length
      return { count: logs.length, success_count: successCount }
    })
  } catch (error) {
    logger.error('Failed to get meetings log stats', error, {
      requestId: correlationId,
      component: 'meetings_api',
      operation: 'get_stats',
      error: error instanceof Error ? error.message : String(error),
    })
    return { count: 0, success_count: 0 }
  }
}

async function getSkillRegistryStats(correlationId: string): Promise<number> {
  const regPath = path.join(process.cwd(), '..', 'skills', 'registry.json')
  try {
    return await withFileLock(regPath, async () => {
      try {
        await fs.stat(regPath)
      } catch (error) {
        logger.warn('Skill registry file not found', {
          requestId: correlationId,
          component: 'skill_registry',
          operation: 'stat_file',
          path: regPath,
        })
        return 0
      }

      const content = await fs.readFile(regPath, 'utf-8')
      const registry = JSON.parse(content)

      // Type-safe null checking with proper validation
      if (registry &&
          typeof registry === 'object' &&
          'meeting_skills' in registry &&
          Array.isArray(registry.meeting_skills)) {
        return registry.meeting_skills.length
      }

      return 0
    })
  } catch (error) {
    logger.error('Failed to load skill registry', error, {
      requestId: correlationId,
      component: 'skill_registry',
      operation: 'load_registry',
      error: error instanceof Error ? error.message : String(error),
    })
    return 0
  }
}

// Alert severity levels - extracted to constants to enable consistent detection
const ALERT_LEVELS = {
  INFO: '[INFO]',
  WARNING: '[WARNING]',
  ERROR: '[ERROR]',
} as const

function generateAlerts(
  meetingsProcessed: number,
  successRate: number,
  brainLogCount: number,
  skillCount: number
): string[] {
  const alerts: string[] = []

  if (successRate < 0.8) {
    alerts.push(`${ALERT_LEVELS.WARNING} Keyword dispatch success rate low: ${(successRate * 100).toFixed(1)}%`)
  }

  if (meetingsProcessed === 0) {
    alerts.push(`${ALERT_LEVELS.INFO} No meetings processed yet`)
  }

  if (brainLogCount === 0) {
    alerts.push(`${ALERT_LEVELS.WARNING} Company-brain not logging outcomes`)
  }

  if (skillCount === 0) {
    alerts.push(`${ALERT_LEVELS.ERROR} Skill registry not found or empty`)
  }

  return alerts
}

export async function GET(request: NextRequest) {
  // Generate correlation ID for tracing
  const correlationId = getOrCreateCorrelationId(request.headers.get('x-correlation-id'))

  // Health check should be public - no auth required
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'health')
  if (rateLimitError) {
    logger.warn('Rate limit exceeded for health check', {
      requestId: correlationId,
      method: request.method,
      path: request.nextUrl.pathname,
      statusCode: 429,
    })
    return rateLimitError
  }

  // Validate query parameters
  const queryResult = await validateQuery(request, HealthQuerySchema)
  if (!queryResult.success) {
    logger.warn('Health check query validation failed', {
      requestId: correlationId,
      method: request.method,
      path: request.nextUrl.pathname,
      error: queryResult.error?.toString() || 'Unknown validation error',
    })
    return queryResult.response
  }

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: 'system', // Health checks don't have a user
  })

  try {
    const [brainStats, meetingsStats, skillCount] = await Promise.all([
      getCompanyBrainStats(correlationId),
      getMeetingsLogStats(correlationId),
      getSkillRegistryStats(correlationId),
    ])

    const successRate = meetingsStats.count > 0 ? meetingsStats.success_count / meetingsStats.count : 0
    const alerts = generateAlerts(meetingsStats.count, successRate, brainStats.count, skillCount)

    const status: HealthStatus = {
      status:
        alerts.length === 0 ? 'healthy' : alerts.some(a => a.startsWith(ALERT_LEVELS.ERROR)) ? 'unhealthy' : 'degraded',
      timestamp: new Date().toISOString(),
      components: {
        meetings_api: {
          status: meetingsStats.count > 0 ? 'operational' : 'no_activity',
          response_time_ms: Date.now() - startTime,
        },
        conductor_api: {
          status: 'operational',
          response_time_ms: 0,
        },
        company_brain: {
          status: brainStats.count > 0 ? 'logging' : 'inactive',
          log_count: brainStats.count,
          latest_timestamp: brainStats.latest,
        },
        skill_registry: {
          status: skillCount > 0 ? 'loaded' : 'missing',
          skill_count: skillCount,
        },
      },
      metrics: {
        total_meetings_processed: meetingsStats.count,
        // NOTE: total_skills_triggered currently reflects meetings with 'scheduled' status
        // To accurately track skills triggered, would need separate skill execution logs
        // Future: integrate skill_execution_logs table for actual skill trigger counts
        total_skills_triggered: meetingsStats.success_count,
        success_rate: successRate,
        recent_logs: Math.min(brainStats.count, 10),
      },
      alerts,
    }

    // Validate response against schema
    const validated = HealthStatusResponseSchema.safeParse(status)
    if (!validated.success) {
      logger.error(
        'Health response validation failed',
        new Error(JSON.stringify(validated.error)),
        formatErrorLog('Schema validation failed for health response', validated.error, {
          requestId: correlationId,
          ...logContext,
          statusCode: 500,
          responseTimeMs: Date.now() - startTime,
          validationDetails: validated.error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        })
      )

      return createErrorResponse(
        'Health check response validation failed',
        ERROR_CODES.INTERNAL_ERROR,
        correlationId,
        500,
        {
          validationErrors: validated.error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        }
      )
    }

    const httpStatus = status.status === 'healthy' ? 200 : status.status === 'degraded' ? 200 : 503
    logger.info('Health check completed', {
      requestId: correlationId,
      ...logContext,
      statusCode: httpStatus,
      responseTimeMs: Date.now() - startTime,
      healthStatus: status.status,
      alertCount: alerts.length,
    })

    const response = NextResponse.json(validated.data, {
      status: httpStatus,
    })
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    const responseTimeMs = Date.now() - startTime
    logger.error(
      'Health check failed',
      error,
      formatErrorLog('Unhandled error during health check', error, {
        requestId: correlationId,
        ...logContext,
        statusCode: 500,
        responseTimeMs,
        operation: 'health_check',
      })
    )

    return createErrorResponse(
      'Failed to check health',
      ERROR_CODES.INTERNAL_ERROR,
      correlationId,
      500,
      { responseTimeMs }
    )
  }
}
