import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'

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

function getCompanyBrainStats(): { count: number; latest: string | null } {
  try {
    const brainDir = path.join(process.cwd(), '..', 'company-brain', 'meetings')
    if (!fs.existsSync(brainDir)) return { count: 0, latest: null }

    const files = fs.readdirSync(brainDir).filter(f => f.endsWith('.json'))
    if (files.length === 0) return { count: 0, latest: null }

    const latest = files.sort().pop()
    let latestTimestamp = null
    if (latest) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(brainDir, latest), 'utf-8'))
        latestTimestamp = content.timestamp
      } catch {}
    }

    return { count: files.length, latest: latestTimestamp }
  } catch {
    return { count: 0, latest: null }
  }
}

function getMeetingsLogStats(): { count: number; success_count: number } {
  try {
    const logPath = path.join(process.cwd(), 'data', 'meetings-log.json')
    if (!fs.existsSync(logPath)) return { count: 0, success_count: 0 }

    const logs = JSON.parse(fs.readFileSync(logPath, 'utf-8'))
    if (!Array.isArray(logs)) return { count: 0, success_count: 0 }

    const successCount = logs.filter((l: any) => l.status === 'scheduled').length
    return { count: logs.length, success_count: successCount }
  } catch {
    return { count: 0, success_count: 0 }
  }
}

function getSkillRegistryStats(): number {
  try {
    const regPath = path.join(process.cwd(), '..', 'skills', 'registry.json')
    const registry = JSON.parse(fs.readFileSync(regPath, 'utf-8'))
    return registry.meeting_skills?.length || 0
  } catch {
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
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const startTime = Date.now()

  try {
    const brainStats = getCompanyBrainStats()
    const meetingsStats = getMeetingsLogStats()
    const skillCount = getSkillRegistryStats()

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

    return NextResponse.json(status, {
      status: status.status === 'healthy' ? 200 : status.status === 'degraded' ? 200 : 503,
    })
  } catch (error) {
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
