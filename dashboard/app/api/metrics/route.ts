import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { createRateLimitMiddleware, addRateLimitHeaders, RATE_LIMIT_CONFIGS } from '@/lib/rateLimit/middleware'

// Create rate limiter for this endpoint
const rateLimitMiddleware = createRateLimitMiddleware(RATE_LIMIT_CONFIGS.metrics)

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
  // Apply rate limiting
  const rateLimitCheck = await rateLimitMiddleware(request)
  if (!rateLimitCheck.allowed) {
    return rateLimitCheck.response!
  }

  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

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
}
