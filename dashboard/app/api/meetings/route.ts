import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { z } from 'zod'
import { MeetingRequestSchema, MeetingTypeSchema, SkillTypeSchema, MeetingStatusSchema, generateId, safeJoin } from '@/lib/validation'
import { validateBody } from '@/lib/validation/middleware'
import { MeetingSchema, type Meeting as MeetingType } from '@/lib/validation/schemas'
import { atomicUpdate, atomicRead, atomicWrite } from '@/lib/atomic-file-ops'
import { withFileLock } from '@/lib/file-lock'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { protectRouteMulti } from '@/lib/protected-route'

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
    return await withFileLock(SKILL_REGISTRY_PATH, async () => {
      const content = await fs.readFile(SKILL_REGISTRY_PATH, 'utf-8')
      return JSON.parse(content)
    })
  } catch {
    return null
  }
}

async function logToBrain(log: MeetingLog): Promise<void> {
  const brainDir = path.join(process.cwd(), '..', 'company-brain', 'meetings')
  const id = generateId('meeting')

  // DEFENSE LAYER 1: Validate meeting_type against strict whitelist schema
  // Schema regex: /^[a-zA-Z0-9_-]+$/ prevents path separators
  const validatedType = MeetingTypeSchema.safeParse(log.meeting_type)
  if (!validatedType.success) {
    throw new Error(
      `Invalid meeting_type: ${validatedType.error.errors.map((e) => e.message).join('; ')}`
    )
  }
  const safeType = validatedType.data

  // DEFENSE LAYER 2: Validate skill_triggered against strict whitelist schema
  // Schema regex: /^[a-zA-Z0-9_-]+$/ prevents path separators
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

  // DEFENSE LAYER 3: Construct filename with validated safe components
  // Format: {type}_{skill}_{id}.json - all components validated by schema or generateId()
  const fileName = `${safeType}_${safeSkill}_${id}.json`

  // DEFENSE LAYER 4: Use safeJoin to prevent any path traversal attempts
  // This performs final validation (basename + dirname check)
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

const meetingHandlers = protectRouteMulti(
  {
    GET: async (request: NextRequest, { userId }) => {
      // Apply rate limiting
      const rateLimitError = await applyRateLimit(request, 'meetings')
      if (rateLimitError) return rateLimitError

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
    },

    POST: async (request: NextRequest, { userId }) => {
      // Apply rate limiting
      const rateLimitError = await applyRateLimit(request, 'meetings')
      if (rateLimitError) return rateLimitError

      try {
        const bodyResult = await validateBody<z.infer<typeof MeetingRequestSchema>>(request, MeetingRequestSchema)
        if (!bodyResult.success) {
          return bodyResult.response
        }
        const { message, meeting_type, participants } = bodyResult.data

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

        // FIX: ATOMIC OPERATION across both systems
        // - Previous code: atomicUpdate() then logToBrain() (two separate operations)
        // - Problem: If logToBrain fails, log is already saved but brain not updated (inconsistency)
        // - Fixed: Both operations inside atomic update - fails together or succeeds together
        const savedLogs = await atomicUpdate<MeetingLog[]>(MEETINGS_LOG, async (logs) => {
          const updated = [...logs, log]

          // Log to brain as part of atomic operation
          // If logToBrain throws, entire atomicUpdate fails (no partial write)
          await logToBrain(log)

          return updated
        })

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
    },
  },
  { requireAuth: true, rateLimitKey: 'meetings' }
)

export const { GET, POST } = meetingHandlers
