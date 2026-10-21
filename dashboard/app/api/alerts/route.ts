import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { AlertCreateSchema, AlertUpdateSchema, generateId } from '@/lib/validation'
import { parseRequestJson, jsonParseErrorResponse } from '@/lib/json-utils'
import { withFileLock } from '@/lib/file-lock'

interface Alert {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'critical'
  component: string
  message: string
  status: 'active' | 'resolved'
}

const ALERTS_LOG = path.join(process.cwd(), 'data', 'alerts.json')

async function ensureAlertsFile(): Promise<void> {
  const dir = path.dirname(ALERTS_LOG)
  try {
    await fs.mkdir(dir, { recursive: true })
    const exists = await fs.stat(ALERTS_LOG).catch(() => null)
    if (!exists) {
      await fs.writeFile(ALERTS_LOG, JSON.stringify([], null, 2), 'utf-8')
    }
  } catch (error) {
    // Silently fail if unable to ensure file - errors will be caught by callers
  }
}

async function loadAlerts(): Promise<Alert[]> {
  return withFileLock(ALERTS_LOG, async () => {
    await ensureAlertsFile()
    try {
      const data = await fs.readFile(ALERTS_LOG, 'utf-8')
      try {
        return JSON.parse(data)
      } catch (parseError) {
        // File exists but contains invalid JSON - this is a corruption error
        throw new Error('Alerts file is corrupted or contains invalid JSON')
      }
    } catch (error) {
      // Re-throw to be handled by API endpoint
      throw error
    }
  })
}

async function saveAlerts(alerts: Alert[]): Promise<void> {
  return withFileLock(ALERTS_LOG, async () => {
    try {
      await ensureAlertsFile()
      await fs.writeFile(ALERTS_LOG, JSON.stringify(alerts, null, 2), 'utf-8')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to save alerts: ${message}`)
    }
  })
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
    const alerts = await loadAlerts()
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
    const alerts = await loadAlerts()
    alerts.push(alert)
    await saveAlerts(alerts)
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to create alert' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, alert }, { status: 201 })
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

  let alerts: Alert[]
  try {
    alerts = await loadAlerts()
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to load alerts' },
      { status: 500 }
    )
  }

  const alertIndex = alerts.findIndex(a => a.id === alert_id)

  if (alertIndex === -1) {
    return NextResponse.json({ success: false, error: 'Alert not found' }, { status: 404 })
  }

  const updatedAlert = { ...alerts[alertIndex], status }
  const updatedAlerts = [...alerts.slice(0, alertIndex), updatedAlert, ...alerts.slice(alertIndex + 1)]
  try {
    await saveAlerts(updatedAlerts)
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to update alert' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, alert: updatedAlert })
}
