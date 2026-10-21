import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { createRateLimitMiddleware, addRateLimitHeaders, RATE_LIMIT_CONFIGS } from '@/lib/rateLimit/middleware'
import { createLogger, createLogContext } from '@/lib/logger'
import { validateQuery } from '@/lib/validation/middleware'
import { MetricsQuerySchema, type MetricsQuery } from '@/lib/validation/schemas'

// Create rate limiter for this endpoint
const rateLimitMiddleware = createRateLimitMiddleware(RATE_LIMIT_CONFIGS.metrics)
const logger = createLogger('metrics-api')

interface Metrics {
  finance: {
    revenue: number
    costs: number
    profit_margin: number
  }
  operations: {
    agents_deployed: number
    skills_available: number
    avg_processing_time_ms: number
  }
  performance: {
    success_rate: number
    error_rate: number
    uptime_percent: number
  }
  user_activity: {
    active_users: number
    total_meetings_processed: number
    avg_task_completion_time_minutes: number
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    operation: 'get_metrics',
  })

  // Apply rate limiting
  const rateLimitCheck = await rateLimitMiddleware(request)
  if (!rateLimitCheck.allowed) {
    logger.warn('Rate limit exceeded for metrics', {
      ...logContext,
      statusCode: 429,
      responseTimeMs: Date.now() - startTime,
    })
    return rateLimitCheck.response!
  }

  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    logger.warn('Unauthorized metrics access attempt', {
      ...logContext,
      statusCode: 401,
      responseTimeMs: Date.now() - startTime,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  try {
    // Validate query parameters with Zod schema
    const queryResult = await validateQuery<MetricsQuery>(request, MetricsQuerySchema)
    if (!queryResult.success) {
      return queryResult.response
    }

    const queryData = queryResult.data as Record<string, unknown>
    // Note: period and format are validated but not currently used in metrics calculation
    // They can be used when implementing historical metrics

    const metrics: Metrics = {
      finance: {
        revenue: 125000,
        costs: 45000,
        profit_margin: 0.64,
      },
      operations: {
        agents_deployed: 12,
        skills_available: 47,
        avg_processing_time_ms: 234,
      },
      performance: {
        success_rate: 0.962,
        error_rate: 0.038,
        uptime_percent: 99.98,
      },
      user_activity: {
        active_users: 23,
        total_meetings_processed: 1847,
        avg_task_completion_time_minutes: 12.5,
      },
    }

    logger.info('Metrics retrieved successfully', {
      ...logContext,
      userId: auth.userId,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    })

    let response = NextResponse.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    })

    // Add rate limit headers
    response = addRateLimitHeaders(
      response,
      rateLimitCheck.remaining!,
      rateLimitCheck.resetTime!,
      rateLimitCheck.limit!
    )

    return response
  } catch (error) {
    logger.error('Metrics retrieval failed', error, {
      ...logContext,
      userId: auth.userId,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })

    return NextResponse.json(
      { success: false, error: 'Failed to retrieve metrics' },
      { status: 500 }
    )
  }
}
