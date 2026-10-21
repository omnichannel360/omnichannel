import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { MeetingRequestSchema, MeetingTypeSchema, SkillTypeSchema, MeetingStatusSchema, generateId, safeJoin } from '@/lib/validation'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { atomicUpdate, atomicRead, atomicWrite } from '@/lib/atomic-file-ops'
import { withFileLock } from '@/lib/file-lock'

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

async function loadMeetingsConfig(): Promise<Record<string, Meeting>> {
  try {
    return await atomicRead<Record<string, Meeting>>(MEETINGS_DATA_PATH)
  } catch {
    return {}
  }
}

async function loadMeetingLogs(): Promise<MeetingLog[]> {
  return atomicRead<MeetingLog[]>(MEETINGS_LOG)
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
  const id = generateId('meeting')

  // DEFENSE LAYER 1: Validate meeting_type against strict whitelist schema
  // Explicit error throwing ensures security events are auditable
  const validatedType = MeetingTypeSchema.safeParse(log.meeting_type)
  if (!validatedType.success) {
    throw new Error(
      `Invalid meeting_type: ${validatedType.error.errors.map((e) => e.message).join('; ')}`
    )
  }
  const safeType = validatedType.data

  // DEFENSE LAYER 2: Validate skill_triggered against strict whitelist schema
  // Explicit error throwing ensures security events are auditable
  let safeSkill = 'unknown'
  if (log.skill_triggered && log.skill_triggered !== 'none') {
    const validatedSkill = SkillTypeSchema.safeParse(log.skill_triggered)
    if (!validatedSkill.success) {
      throw new Error(
        `Invalid skill_triggered: ${validatedSkill.error.errors.map((e) => e.message).join('; ')}`
      )
    }
    safeSkill = validatedSkill.data
  }

  // DEFENSE LAYER 3: Verify validated inputs contain no path components
  // Even though schema validation already blocks these, this explicit check ensures
  // defense-in-depth: if schema validation has a bug, this catches it
  const basenameOnlyType = path.basename(safeType)
  const basenameOnlySkill = path.basename(safeSkill)
  if (basenameOnlyType !== safeType || basenameOnlySkill !== safeSkill) {
    throw new Error(
      `SECURITY: Validated input contains path separators (schema validation failure): type=${safeType}, skill=${safeSkill}`
    )
  }

  // DEFENSE LAYER 4: Construct filename with validated safe components
  // Format: {type}_{skill}_{id}.json - all components are validated + verified
  const fileName = `${basenameOnlyType}_${basenameOnlySkill}_${id}.json`

  // DEFENSE LAYER 5: Use safeJoin to prevent any remaining path traversal attempts
  // This performs resolution and containment validation (uses basename + dirname check)
  const filePath = safeJoin(brainDir, fileName)

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

  // Atomic write ensures the log file is written safely with lock
  await atomicWrite(filePath, brainRecord)
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

    // SECURITY: Validate meeting_type against whitelist schema (Layer 1)
    const validatedMeetingType = parsed.meeting_type
      ? MeetingTypeSchema.safeParse(parsed.meeting_type)
      : { success: false }
    const safeMeetingType = validatedMeetingType.success
      ? validatedMeetingType.data
      : 'unknown'

    // SECURITY: Validate skill_triggered against whitelist schema (Layer 2)
    let safeSkill = 'none'
    if (parsed.skill && parsed.skill !== 'none') {
      const validatedSkill = SkillTypeSchema.safeParse(parsed.skill)
      if (validatedSkill.success) {
        safeSkill = validatedSkill.data
      } else {
        // Invalid skill detected - use safe default
        // Silently reject invalid skills for security (don't echo back to user)
        safeSkill = 'unknown'
      }
    }

    const log: MeetingLog = {
      timestamp: new Date().toISOString(),
      meeting_type: safeMeetingType,
      skill_triggered: safeSkill,
      status: safeSkill !== 'unknown' && safeSkill !== 'none' ? 'scheduled' : 'failed',
      participants: participants || [],
      outcomes: {},
    }

    // ATOMIC OPERATION: Load logs → add new log → save in single critical section
    const savedLog = await atomicUpdate<MeetingLog[], MeetingLog>(MEETINGS_LOG, async (logs) => {
      const updated = [...logs, log]
      return { updated, result: log }
    })

    await logToBrain(savedLog)

    // SECURITY: Return only validated data in response to prevent leaking unvalidated input
    const response = safeSkill !== 'none' && safeSkill !== 'unknown'
      ? `Dispatching meeting skill: ${safeSkill} for "${safeMeetingType}". Meeting logged and skill triggered.`
      : `No meeting detected in message. Please specify a meeting type or use a meeting-related keyword.`

    return NextResponse.json({
      success: safeSkill !== 'none' && safeSkill !== 'unknown',
      response,
      meeting_type: safeMeetingType,
      skill_triggered: safeSkill,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to process meeting request' },
      { status: 500 }
    )
  }
}
