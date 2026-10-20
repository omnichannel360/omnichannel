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

const MEETINGS_DATA_PATH = path.join(process.cwd(), 'data', 'meetings.json')
const MEETINGS_LOG = path.join(process.cwd(), 'data', 'meetings-log.json')

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

const SKILL_MAPPING: Record<string, string> = {
  'daily-standup': 'standup_report',
  'sprint-planning': 'sprint_planning',
  'sprint-review': 'sprint_review',
  'retrospective': 'retrospective_kaizen',
  'postmortem': 'postmortem',
  'go-no-go': 'go_no_go',
  'board-meeting': 'board_meeting',
  'architecture-review': 'architecture_review',
  'client-kickoff': 'client_kickoff',
  'app-intake': 'app_intake',
  'security-review': 'security_review',
  'growth-review': 'growth_review',
  'kb-review': 'kb_review',
  'agent-perf-review': 'agent_perf_review',
  'monthly-retainer-status': 'monthly_retainer_status',
  'one-on-one': 'one_on_one',
  'all-hands': 'all_hands',
  'hiring-debrief': 'hiring_debrief',
  'design-critique': 'design_critique',
}

function parseMeetingFromMessage(message: string): {
  meeting_type: string | null
  skill: string | null
  description: string
} {
  const lowerMessage = message.toLowerCase()

  for (const [key, skill] of Object.entries(SKILL_MAPPING)) {
    if (
      lowerMessage.includes(key.replace(/-/g, ' ')) ||
      lowerMessage.includes(key) ||
      lowerMessage.includes(skill.replace(/_/g, ' '))
    ) {
      return {
        meeting_type: key,
        skill,
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

    const meetingsList = Object.entries(meetings).map(([id, meeting]) => ({
      id,
      ...meeting,
    }))

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

    let parsed = {
      meeting_type: meeting_type || null,
      skill: null,
      description: message || '',
    }

    if (message) {
      parsed = parseMeetingFromMessage(message)
    }

    if (parsed.meeting_type && SKILL_MAPPING[parsed.meeting_type]) {
      parsed.skill = SKILL_MAPPING[parsed.meeting_type]
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

    logs.push(log)
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
