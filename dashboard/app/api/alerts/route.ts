import { NextRequest, NextResponse } from 'next/server'
import { atomicUpdate, atomicRead } from '@/lib/atomic-file-ops'
import { AlertCreateSchema, AlertUpdateSchema, AlertLevelSchema, AlertStatusSchema, generateId } from '@/lib/validation'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import path from 'path'

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
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Unauthorized')
  }

  try {
    const alerts = await atomicRead<Alert[]>(ALERTS_FILE, [])
    return NextResponse.json({ success: true, alerts, total: alerts.length })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to load alerts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Unauthorized')
  }

  try {
    const body = await request.json()
    const parsed = AlertCreateSchema.safeParse(body)
    if (!parsed.success) {
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

    return NextResponse.json({ success: true, alert: newAlert }, { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: 'Failed to create alert' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Unauthorized')
  }

  try {
    const body = await request.json()
    const parsed = AlertUpdateSchema.safeParse(body)
    if (!parsed.success) {
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
    return NextResponse.json({ success: true, alert: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update alert'
    const status = message === 'Alert not found' ? 404 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
