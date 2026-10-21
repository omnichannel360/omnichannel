import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

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

function ensureDataDir() {
  const dir = path.dirname(MEETINGS_LOG)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function loadMeetingsConfig(): Record<string, Meeting> {
  try {
    const content = fs.readFileSync(MEETINGS_DATA_PATH, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

function loadMeetingLogs(): MeetingLog[] {
  ensureDataDir()
  if (!fs.existsSync(MEETINGS_LOG)) return []
  try {
    const data = fs.readFileSync(MEETINGS_LOG, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

function saveMeetingLogs(logs: MeetingLog[]) {
  ensureDataDir()
  fs.writeFileSync(MEETINGS_LOG, JSON.stringify(logs, null, 2))
}

function loadSkillRegistry(): SkillRegistry | null {
  try {
    const content = fs.readFileSync(SKILL_REGISTRY_PATH, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}


function logToBrain(log: MeetingLog) {
  const brainDir = path.join(process.cwd(), '..', 'company-brain', 'meetings')
  if (!fs.existsSync(brainDir)) {
    fs.mkdirSync(brainDir, { recursive: true })
  }

  const fileName = `${log.meeting_type}_${new Date().getTime()}.json`
  const filePath = path.join(brainDir, fileName)

  const brainRecord = {
    id: `meeting_${Date.now()}`,
    timestamp: log.timestamp,
    category: 'meetings',
    meeting_type: log.meeting_type,
    skill_triggered: log.skill_triggered,
    participants: log.participants || [],
    outcomes: log.outcomes || {},
    status: log.status,
  }

  fs.writeFileSync(filePath, JSON.stringify(brainRecord, null, 2))
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

export async function GET() {
  try {
    const meetings = loadMeetingsConfig()
    const logs = loadMeetingLogs()

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
  try {
    const body = await request.json()
    const { message, meeting_type, participants } = body

    if (!message && !meeting_type) {
      return NextResponse.json(
        { success: false, error: 'Message or meeting_type required' },
        { status: 400 }
      )
    }

    const registry = loadSkillRegistry()

    let parsed: { meeting_type: string | null; skill: string | null; description: string } = {
      meeting_type: meeting_type || null,
      skill: null,
      description: message || '',
    }

    if (message) {
      parsed = parseMeetingFromMessage(message, registry)
    }

    const logs = loadMeetingLogs()
    const log: MeetingLog = {
      timestamp: new Date().toISOString(),
      meeting_type: parsed.meeting_type || 'unknown',
      skill_triggered: parsed.skill || 'none',
      status: parsed.skill ? 'scheduled' : 'failed',
      participants: participants || [],
      outcomes: {},
    }

    logs.push(log); logToBrain(log);
    saveMeetingLogs(logs)

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

