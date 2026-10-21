import { NextRequest, NextResponse } from 'next/server'
import { atomicUpdate, atomicRead } from '@/lib/atomic-file-ops'
import { AlertCreateSchema, AlertUpdateSchema, AlertLevelSchema, AlertStatusSchema, generateId } from '@/lib/validation'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { logger, createLogContext } from '@/lib/logger'
import path from 'path'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'

interface Alert {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'critical'
  component: string
  message: string
  status: 'active' | 'resolved'
}

const ALERTS_FILE = path.join(process.cwd(), 'data', 'alerts.json')

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'alerts')
  if (rateLimitError) return rateLimitError

  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    logger.warn('Unauthorized alerts GET attempt', {
      method: request.method,
      path: request.nextUrl.pathname,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Unauthorized')
  }

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,
    operation: 'load_alerts',
  })

  try {
    const alerts = await atomicRead<Alert[]>(ALERTS_FILE, [])
    logger.info('Alerts loaded successfully', {
      ...logContext,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      alertCount: alerts.length,
    })
    return NextResponse.json({ success: true, alerts, total: alerts.length })
  } catch (error) {
    logger.error('Failed to load alerts', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json({ success: false, error: 'Failed to load alerts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'alerts')
  if (rateLimitError) return rateLimitError

  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    logger.warn('Unauthorized alerts POST attempt', {
      method: request.method,
      path: request.nextUrl.pathname,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Unauthorized')
  }

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,
    operation: 'create_alert',
  })

  try {
    const body = await request.json()
    const parsed = AlertCreateSchema.safeParse(body)
    if (!parsed.success) {
      logger.warn('Alert creation validation failed', {
        ...logContext,
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
        validationErrors: parsed.error.flatten().fieldErrors,
      })
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }

    const newAlert: Alert = {
      id: generateId('alert'),
      timestamp: new Date().toISOString(),
      ...parsed.data,
      status: 'active',
    }

    await atomicUpdate<Alert[]>(
      ALERTS_FILE,
      (alerts) => [...alerts, newAlert],
      []
    )

    logger.info('Alert created successfully', {
      ...logContext,
      statusCode: 201,
      responseTimeMs: Date.now() - startTime,
      alertId: newAlert.id,
    })

    return NextResponse.json({ success: true, alert: newAlert }, { status: 201 })
  } catch (error) {
    let statusCode = 500
    let errorMessage = 'Failed to create alert'

    if (error instanceof SyntaxError) {
      statusCode = 400
      errorMessage = 'Invalid JSON in request body'
    }

    logger.error('Alert creation failed', error, {
      ...logContext,
      statusCode,
      responseTimeMs: Date.now() - startTime,
    })

    return NextResponse.json({ success: false, error: errorMessage }, { status: statusCode })
  }
}

export async function PATCH(request: NextRequest) {
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'alerts')
  if (rateLimitError) return rateLimitError

  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    logger.warn('Unauthorized alerts PATCH attempt', {
      method: request.method,
      path: request.nextUrl.pathname,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Unauthorized')
  }

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,
    operation: 'update_alert',
  })

  try {
    const body = await request.json()
    const parsed = AlertUpdateSchema.safeParse(body)
    if (!parsed.success) {
      logger.warn('Alert update validation failed', {
        ...logContext,
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
        validationErrors: parsed.error.flatten().fieldErrors,
      })
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }

    const { alert_id, status } = parsed.data

    const result = await atomicUpdate<Alert[]>(
      ALERTS_FILE,
      (alerts) => {
        const index = alerts.findIndex((a) => a.id === alert_id)
        if (index === -1) throw new Error('Alert not found')
        return [...alerts.slice(0, index), { ...alerts[index], status }, ...alerts.slice(index + 1)]
      },
      []
    )

    const updated = result.find((a) => a.id === alert_id)

    logger.info('Alert updated successfully', {
      ...logContext,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      alertId: alert_id,
      newStatus: status,
    })

    return NextResponse.json({ success: true, alert: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update alert'
    const statusCode = message === 'Alert not found' ? 404 : 500

    logger.error('Alert update failed', error, {
      ...logContext,
      statusCode,
      responseTimeMs: Date.now() - startTime,
    })

    return NextResponse.json({ success: false, error: message }, { status: statusCode })
  }
}
