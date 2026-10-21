import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { HealthStatusResponseSchema, HealthComponentSchema, HealthQuerySchema } from '@/lib/validation'
import { validateQuery } from '@/lib/validation/middleware'
import { logger, createLogContext, LogContext } from '@/lib/logger'
import { asyncRoute } from '@/lib/async-route'
import { getOrCreateCorrelationId } from '@/lib/middleware/error-context'

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

async function getCompanyBrainStats(): Promise<{ count: number; latest: string | null }> {
  try {
    const brainDir = path.join(process.cwd(), '..', 'company-brain', 'meetings')
    try {
      await fs.stat(brainDir)
    } catch {
      return { count: 0, latest: null }
    }

    const files = (await fs.readdir(brainDir)).filter(f => f.endsWith('.json'))
    if (files.length === 0) return { count: 0, latest: null }

    const latest = files.sort().pop()
    let latestTimestamp = null
    if (latest) {
      try {
        const content = await fs.readFile(path.join(brainDir, latest), 'utf-8')
        const parsed = JSON.parse(content)
        latestTimestamp = parsed.timestamp
      } catch (error) {
        logger.warn('Failed to parse company brain latest file', {
          component: 'company_brain',
          operation: 'parse_latest_timestamp',
        })
      }
    }

    return { count: files.length, latest: latestTimestamp }
  } catch (error) {
    logger.error('Failed to get company brain stats', error, {
      component: 'company_brain',
      operation: 'get_stats',
    })
    return { count: 0, latest: null }
  }
}

async function getMeetingsLogStats(): Promise<{ count: number; success_count: number }> {
  try {
    const logPath = path.join(process.cwd(), 'data', 'meetings-log.json')
    try {
      await fs.stat(logPath)
    } catch {
      return { count: 0, success_count: 0 }
    }

    const content = await fs.readFile(logPath, 'utf-8')
    const logs = JSON.parse(content)
    if (!Array.isArray(logs)) {
      logger.warn('Meetings log is not an array', {
        component: 'meetings_api',
        operation: 'parse_log',
        actualType: typeof logs,
      })
      return { count: 0, success_count: 0 }
    }

    const successCount = logs.filter((l: any) => l.status === 'scheduled').length
    return { count: logs.length, success_count: successCount }
  } catch (error) {
    logger.error('Failed to get meetings log stats', error, {
      component: 'meetings_api',
      operation: 'get_stats',
    })
    return { count: 0, success_count: 0 }
  }
}

async function getSkillRegistryStats(): Promise<number> {
  try {
    const regPath = path.join(process.cwd(), '..', 'skills', 'registry.json')
    const content = await fs.readFile(regPath, 'utf-8')
    const registry = JSON.parse(content)
    return registry.meeting_skills?.length || 0
  } catch (error) {
    logger.error('Failed to load skill registry', error, {
      component: 'skill_registry',
      operation: 'load_registry',
    })
    return 0
  }
}

function generateAlerts(
  meetingsProcessed: number,
  successRate: number,
  brainLogCount: number,
  skillCount: number
): string[] {
  const alerts: string[] = []

  if (successRate < 0.8) {
    alerts.push(`⚠️ Keyword dispatch success rate low: ${(successRate * 100).toFixed(1)}%`)
  }

  if (meetingsProcessed === 0) {
    alerts.push('ℹ️ No meetings processed yet')
  }

  if (brainLogCount === 0) {
    alerts.push('⚠️ Company-brain not logging outcomes')
  }

  if (skillCount === 0) {
    alerts.push('❌ Skill registry not found or empty')
  }

  return alerts
}

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'health')
  if (rateLimitError) return rateLimitError

  // Validate query parameters
  const queryResult = await validateQuery(request, HealthQuerySchema)
  if (!queryResult.success) {
    return queryResult.response
  }

  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    logger.warn('Unauthorized health check attempt', {
      method: request.method,
      path: request.nextUrl.pathname,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,
  })

  try {
    const [brainStats, meetingsStats, skillCount] = await Promise.all([
      getCompanyBrainStats(),
      getMeetingsLogStats(),
      getSkillRegistryStats(),
    ])

    const successRate = meetingsStats.count > 0 ? meetingsStats.success_count / meetingsStats.count : 0
    const alerts = generateAlerts(meetingsStats.count, successRate, brainStats.count, skillCount)

    const status: HealthStatus = {
      status:
        alerts.length === 0 ? 'healthy' : alerts.some(a => a.startsWith('❌')) ? 'unhealthy' : 'degraded',
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
        total_skills_triggered: meetingsStats.success_count,
        success_rate: successRate,
        recent_logs: Math.min(brainStats.count, 10),
      },
      alerts,
    }

    // Validate response against schema
    const validated = HealthStatusResponseSchema.safeParse(status)
    if (!validated.success) {
      logger.error('Health response validation failed', new Error(JSON.stringify(validated.error)), {
        ...logContext,
        statusCode: 500,
        responseTimeMs: Date.now() - startTime,
      })
      return NextResponse.json(
        { success: false, error: 'Health check response validation failed' },
        { status: 500 }
      )
    }

    const httpStatus = status.status === 'healthy' ? 200 : status.status === 'degraded' ? 200 : 503
    logger.info('Health check completed', {
      ...logContext,
      statusCode: httpStatus,
      responseTimeMs: Date.now() - startTime,
      healthStatus: status.status,
      alertCount: alerts.length,
    })

    return NextResponse.json(validated.data, {
      status: httpStatus,
    })
  } catch (error) {
    const responseTimeMs = Date.now() - startTime
    logger.error('Health check failed', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs,
      operation: 'health_check',
    })

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Failed to check health',
        components: {},
        metrics: {},
        alerts: ['❌ Health check failed'],
      },
      { status: 500 }
    )
  }
}
