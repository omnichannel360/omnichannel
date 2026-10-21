import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
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

function ensureAlertsFile() {
  const dir = path.dirname(ALERTS_LOG)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(ALERTS_LOG)) fs.writeFileSync(ALERTS_LOG, JSON.stringify([], null, 2))
}

function loadAlerts(): Alert[] {
  ensureAlertsFile()
  try {
    const data = fs.readFileSync(ALERTS_LOG, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

function saveAlerts(alerts: Alert[]) {
  ensureAlertsFile()
  fs.writeFileSync(ALERTS_LOG, JSON.stringify(alerts, null, 2))
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

  const alerts = loadAlerts()
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

  const parsedBody = AlertCreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { level, component, message } = parsedBody.data
  const alert = createAlert(level, component, message)
  const alerts = loadAlerts()

  alerts.push(alert)
  saveAlerts(alerts)

  return NextResponse.json({ success: true, alert }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const parsedBody = AlertUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { alert_id, status } = parsedBody.data

  const alerts = loadAlerts()
  const alert = alerts.find(a => a.id === alert_id)

  if (!alert) {
    return NextResponse.json({ success: false, error: 'Alert not found' }, { status: 404 })
  }

  alert.status = status
  saveAlerts(alerts)

  return NextResponse.json({ success: true, alert })
}
