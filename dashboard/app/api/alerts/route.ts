import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { AlertCreateSchema, AlertUpdateSchema, generateId } from '@/lib/validation'

interface Alert {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'critical'
  component: string
  message: string
  status: 'active' | 'resolved'
}

const ALERTS_LOG = path.join(process.cwd(), 'data', 'alerts.json')

async function ensureAlertsFile() {
  const dir = path.dirname(ALERTS_LOG)
  try {
    await fs.mkdir(dir, { recursive: true })
    const exists = await fs.stat(ALERTS_LOG).catch(() => null)
    if (!exists) {
      await fs.writeFile(ALERTS_LOG, JSON.stringify([], null, 2), 'utf-8')
    }
  } catch (error) {
    console.error('[AlertsAPI] Error ensuring alerts file:', error)
  }
}

async function loadAlerts(): Promise<Alert[]> {
  await ensureAlertsFile()
  try {
    const data = await fs.readFile(ALERTS_LOG, 'utf-8')
    try {
      return JSON.parse(data)
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : 'Unknown parse error'
      console.error('[AlertsAPI] JSON parse error:', message)
      return []
    }
  } catch {
    return []
  }
}

async function saveAlerts(alerts: Alert[]): Promise<void> {
  try {
    await ensureAlertsFile()
    await fs.writeFile(ALERTS_LOG, JSON.stringify(alerts, null, 2))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Failed to save alerts: ${message}`)
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

  const alerts = await loadAlerts()
  const activeOnly = request.nextUrl.searchParams.get('active') === 'true'

  return NextResponse.json({
    success: true,
    alerts: activeOnly ? alerts.filter(a => a.status === 'active') : alerts,
    total: alerts.length,
  })
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  const parsedBody = AlertCreateSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { level, component, message } = parsedBody.data
  const alert = createAlert(level, component, message)
  const alerts = await loadAlerts()

  alerts.push(alert)
  await saveAlerts(alerts)

  return NextResponse.json({ success: true, alert }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  const parsedBody = AlertUpdateSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { alert_id, status } = parsedBody.data

  const alerts = await loadAlerts()
  const alert = alerts.find(a => a.id === alert_id)

  if (!alert) {
    return NextResponse.json({ success: false, error: 'Alert not found' }, { status: 404 })
  }

  alert.status = status
  try {
    await saveAlerts(alerts)
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update alert' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, alert })
}
