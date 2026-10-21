import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { atomicUpdate, atomicRead } from '@/lib/atomic-file-ops'
import { AlertCreateSchema, AlertUpdateSchema, generateId } from '@/lib/validation'
import { parseRequestJson, jsonParseErrorResponse } from '@/lib/json-utils'

interface Alert {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'critical'
  component: string
  message: string
  status: 'active' | 'resolved'
}

const ALERTS_LOG = path.join(process.cwd(), 'data', 'alerts.json')

function createAlert(level: Alert['level'], component: string, message: string): Alert {
  return {
    id: generateId('alert'),
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    status: 'active',
  }
}

function createAlert(level: Alert['level'], component: string, message: string): Alert {
  return {
    id: generateId('alert'),
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    status: 'active',
  }
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  try {
    const alerts = await atomicRead<Alert[]>(ALERTS_LOG)
    const activeOnly = request.nextUrl.searchParams.get('active') === 'true'

    return NextResponse.json({
      success: true,
      alerts: activeOnly ? alerts.filter(a => a.status === 'active') : alerts,
      total: alerts.length,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to load alerts' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const parsed = await parseRequestJson(request)
  if (!parsed.success) {
    return jsonParseErrorResponse()
  }

  const body = parsed.body
  const parsedBody = AlertCreateSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { level, component, message } = parsedBody.data
  const alert = createAlert(level, component, message)

  try {
    // Atomic operation: load → add → save in single critical section
    const result = await atomicUpdate<Alert[], Alert>(ALERTS_LOG, async (alerts) => {
      const updated = [...alerts, alert]
      return { updated, result: alert }
    })
    return NextResponse.json({ success: true, alert: result }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to create alert' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const parsed = await parseRequestJson(request)
  if (!parsed.success) {
    return jsonParseErrorResponse()
  }

  const body = parsed.body
  const parsedBody = AlertUpdateSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { alert_id, status } = parsedBody.data

  try {
    // Atomic operation: load → find → update → save in single critical section
    const result = await atomicUpdate<Alert[], Alert>(ALERTS_LOG, async (alerts) => {
      const alertIndex = alerts.findIndex(a => a.id === alert_id)
      if (alertIndex === -1) {
        throw new Error('Alert not found')
      }

      const updatedAlert = { ...alerts[alertIndex], status }
      const updated = [...alerts.slice(0, alertIndex), updatedAlert, ...alerts.slice(alertIndex + 1)]
      return { updated, result: updatedAlert }
    })

    return NextResponse.json({ success: true, alert: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update alert'
    if (message === 'Alert not found') {
      return NextResponse.json({ success: false, error: 'Alert not found' }, { status: 404 })
    }
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
