import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { MeetingRequestSchema, MeetingTypeSchema, MeetingStatusSchema, generateId, safeJoin } from '@/lib/validation'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'

interface Meeting {
  id: string
  name: string
  duration_minutes: number
  frequency: string
  purpose: string
  required_fields: string[]
  attendees: string
}

interface MeetingLog {
  timestamp: string
  meeting_type: string
  skill_triggered: string
  status: 'scheduled' | 'completed' | 'failed'
  participants?: string[]
  outcomes?: Record<string, unknown>
}

interface SkillRegistry {
  keyword_index: Record<string, string>
}

const MEETINGS_DATA_PATH = path.join(process.cwd(), 'data', 'meetings.json')
const MEETINGS_LOG = path.join(process.cwd(), 'data', 'meetings-log.json')
const SKILL_REGISTRY_PATH = path.join(process.cwd(), '..', 'skills', 'registry.json')

async function ensureDataDir() {
  const dir = path.dirname(MEETINGS_LOG)
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // Already exists
  }
}

async function loadMeetingsConfig(): Promise<Record<string, Meeting>> {
  try {
    const content = await fs.readFile(MEETINGS_DATA_PATH, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

async function loadMeetingLogs(): Promise<MeetingLog[]> {
  await ensureDataDir()
  try {
    await fs.stat(MEETINGS_LOG)
    const data = await fs.readFile(MEETINGS_LOG, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function saveMeetingLogs(logs: MeetingLog[]): Promise<void> {
  await ensureDataDir()
  await fs.writeFile(MEETINGS_LOG, JSON.stringify(logs, null, 2), 'utf-8')
}

async function loadSkillRegistry(): Promise<SkillRegistry | null> {
  try {
    const content = await fs.readFile(SKILL_REGISTRY_PATH, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function logToBrain(log: MeetingLog): Promise<void> {
  const brainDir = path.join(process.cwd(), '..', 'company-brain', 'meetings')
  try {
    await fs.mkdir(brainDir, { recursive: true })
  } catch {
    // Already exists
  }

  const id = generateId('meeting')
  const safeType = MeetingTypeSchema.safeParse(log.meeting_type)
  const filePath = safeJoin(brainDir, `${safeType.success ? safeType.data : 'unknown'}_${id}.json`)

  const brainRecord = {
    id,
    timestamp: log.timestamp,
    category: 'meetings',
    meeting_type: log.meeting_type,
    skill_triggered: log.skill_triggered,
    participants: log.participants || [],
    outcomes: log.outcomes || {},
    status: MeetingStatusSchema.parse(log.status),
  }

  await fs.writeFile(filePath, JSON.stringify(brainRecord, null, 2), 'utf-8')
}

function parseMeetingFromMessage(message: string, registry: SkillRegistry | null): {
  meeting_type: string | null
  skill: string | null
  description: string
} {
  if (!registry) {
    return {
      meeting_type: null,
      skill: null,
      description: message,
    }
  }

  const lowerMessage = message.toLowerCase()
  for (const [keyword, skillId] of Object.entries(registry.keyword_index)) {
    if (lowerMessage.includes(keyword)) {
      return {
        meeting_type: skillId,
        skill: skillId,
        description: message,
      }
    }
  }

  return {
    meeting_type: null,
    skill: null,
    description: message,
  }
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  try {
    const meetings = await loadMeetingsConfig()
    const logs = await loadMeetingLogs()

    const meetingsList = Object.values(meetings)

    return NextResponse.json({
      success: true,
      data: {
        meetings: meetingsList,
        recentLogs: logs.slice(-10),
      },
      meta: {
        total_meetings: meetingsList.length,
        recent_logs: logs.length,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to load meetings' },
      { status: 500 }
    )
  }
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

  try {
    const input = MeetingRequestSchema.safeParse(body)
    if (!input.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: input.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { message, meeting_type, participants } = input.data

    const registry = await loadSkillRegistry()

    let parsed: { meeting_type: string | null; skill: string | null; description: string } = {
      meeting_type: meeting_type || null,
      skill: null,
      description: message || '',
    }

    if (message) {
      parsed = parseMeetingFromMessage(message, registry)
    }

    const logs = await loadMeetingLogs()
    const log: MeetingLog = {
      timestamp: new Date().toISOString(),
      meeting_type: MeetingTypeSchema.safeParse(parsed.meeting_type).success ? (parsed.meeting_type as string) : 'unknown',
      skill_triggered: parsed.skill || 'none',
      status: parsed.skill ? 'scheduled' : 'failed',
      participants: participants || [],
      outcomes: {},
    }

    logs.push(log)
    await logToBrain(log)
    await saveMeetingLogs(logs)

    const response = parsed.skill
      ? `Dispatching meeting skill: ${parsed.skill} for "${parsed.meeting_type}". Meeting logged and skill triggered.`
      : `No meeting detected in message. Please specify a meeting type or use a meeting-related keyword.`

    return NextResponse.json({
      success: !!parsed.skill,
      response,
      meeting_type: parsed.meeting_type,
      skill_triggered: parsed.skill,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to process meeting request' },
      { status: 500 }
    )
  }
}
