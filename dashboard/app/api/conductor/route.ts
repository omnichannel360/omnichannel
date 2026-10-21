import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { z } from 'zod'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { withFileLock } from '@/lib/file-lock'
import { ensureDataDir } from '@/lib/ensure-dir'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { createLogger, createLogContext } from '@/lib/logger'

const logger = createLogger('conductor-api')

interface ConversationLog {
  timestamp: string
  userMessage: string
  conductorResponse: string
  dispatchedAgents?: string[]
  dispatchedSkills?: string[]
}

interface SkillRegistry {
  keyword_index: Record<string, string>
}

const LOG_FILE = path.join(process.cwd(), 'data', 'conductor-logs.json')
const SKILL_REGISTRY_PATH = path.join(process.cwd(), '..', 'skills', 'registry.json')

// Schema validation for conductor request body
const ConductorMessageSchema = z.object({
  message: z.string().min(1).max(2000),
})

async function loadSkillRegistry(): Promise<SkillRegistry | null> {
  try {
    const data = await fs.readFile(SKILL_REGISTRY_PATH, 'utf-8')
    try {
      return JSON.parse(data)
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : 'Unknown parse error'
      console.error('[ConductorAPI] JSON parse error when loading skill registry:', message)
      return null
    }
  } catch (readError) {
    const message = readError instanceof Error ? readError.message : 'Unknown read error'
    console.debug('[ConductorAPI] Skill registry file not found or unreadable:', message)
    return null
  }
}

async function loadLogs(): Promise<ConversationLog[]> {
  return withFileLock(LOG_FILE, async () => {
    await ensureDataDir(path.dirname(LOG_FILE))
    try {
      const data = await fs.readFile(LOG_FILE, 'utf-8')
      try {
        return JSON.parse(data)
      } catch (parseError) {
        const message = parseError instanceof Error ? parseError.message : 'Unknown parse error'
        console.error('[ConductorAPI] JSON parse error when loading logs:', message)
        return []
      }
    } catch (readError) {
      const message = readError instanceof Error ? readError.message : 'Unknown read error'
      console.error('[ConductorAPI] Error reading logs file:', message)
      return []
    }
  })
}

async function saveLogs(logs: ConversationLog[]): Promise<void> {
  return withFileLock(LOG_FILE, async () => {
    await ensureDataDir(path.dirname(LOG_FILE))
    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2), 'utf-8')
  })
}

function findMatchingSkill(message: string, registry: SkillRegistry | null): string | null {
  if (!registry) return null
  const lowerMessage = message.toLowerCase()
  for (const [keyword, skillId] of Object.entries(registry.keyword_index)) {
    if (lowerMessage.includes(keyword)) {
      return skillId
    }
  }
  return null
}

function parseTaskFromMessage(message: string): {
  action: string
  agents: string[]
  description: string
} {
  const agents: string[] = []

  if (message.toLowerCase().includes('test')) agents.push('test-automation-1', 'test-automation-2')
  if (message.toLowerCase().includes('fix') || message.toLowerCase().includes('bug')) agents.push('bug-fixer-1', 'bug-fixer-2')
  if (message.toLowerCase().includes('code') || message.toLowerCase().includes('deploy')) agents.push('backend-dev-node', 'devops-engineer-1')
  if (message.toLowerCase().includes('design')) agents.push('ui-designer-web', 'design-director')
  if (message.toLowerCase().includes('analyze')) agents.push('data-engineer', 'analytics-engineer')
  if (message.toLowerCase().includes('review')) agents.push('code-reviewer', 'backend-reviewer', 'frontend-reviewer')

  const uniqueAgents = [...new Set(agents)]

  return {
    action: message.split(' ').slice(0, 2).join(' '),
    agents: uniqueAgents.length > 0 ? uniqueAgents : ['conductor'],
    description: message,
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    operation: 'dispatch_task',
  })

  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'conductor')
  if (rateLimitError) {
    logger.warn('Rate limit exceeded for conductor', {
      ...logContext,
      statusCode: 429,
      responseTimeMs: Date.now() - startTime,
    })
    return rateLimitError
  }

  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    logger.warn('Unauthorized conductor access attempt', {
      ...logContext,
      statusCode: 401,
      responseTimeMs: Date.now() - startTime,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    logger.warn('Conductor request JSON parse failed', {
      ...logContext,
      userId: auth.userId,
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  try {
    // Validate body against schema
    const parsedBody = ConductorMessageSchema.safeParse(body)
    if (!parsedBody.success) {
      logger.warn('Conductor validation failed', {
        ...logContext,
        userId: auth.userId,
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
        validationErrors: parsedBody.error.flatten().fieldErrors,
      })
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: parsedBody.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { message } = parsedBody.data

    const registry = await loadSkillRegistry()
    const skillId = findMatchingSkill(message, registry)
    const task = parseTaskFromMessage(message)

    let response: string
    let dispatchedSkills: string[] = []
    let dispatchedAgents: string[] = []

    if (skillId) {
      response = `Dispatching meeting skill: "${skillId}". Task logged and skill triggered.`
      dispatchedSkills = [skillId]
    } else if (task.agents.length > 0 && task.agents[0] !== 'conductor') {
      response = `Dispatching "${task.action}" to: ${task.agents.join(', ')}. Task logged and agents notified.`
      dispatchedAgents = task.agents
    } else {
      response = `Processing: ${task.action}. No specific agents assigned. Awaiting clarification.`
    }

    const logs = await loadLogs()
    logs.push({
      timestamp: new Date().toISOString(),
      userMessage: message,
      conductorResponse: response,
      dispatchedAgents: dispatchedAgents.length > 0 ? dispatchedAgents : undefined,
      dispatchedSkills: dispatchedSkills.length > 0 ? dispatchedSkills : undefined,
    })
    await saveLogs(logs)

    logger.info('Task dispatched successfully', {
      ...logContext,
      userId: auth.userId,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      taskAction: task.action,
      agentCount: dispatchedAgents.length,
      skillCount: dispatchedSkills.length,
    })

    return NextResponse.json({
      success: true,
      response,
      dispatchedAgents: dispatchedAgents.length > 0 ? dispatchedAgents : undefined,
      dispatchedSkills: dispatchedSkills.length > 0 ? dispatchedSkills : undefined,
    })
  } catch (error) {
    logger.error('Task dispatch failed', error, {
      ...logContext,
      userId: auth.userId,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    operation: 'load_conductor_logs',
  })

  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'conductor')
  if (rateLimitError) {
    logger.warn('Rate limit exceeded for conductor logs', {
      ...logContext,
      statusCode: 429,
      responseTimeMs: Date.now() - startTime,
    })
    return rateLimitError
  }

  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    logger.warn('Unauthorized conductor logs access attempt', {
      ...logContext,
      statusCode: 401,
      responseTimeMs: Date.now() - startTime,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  try {
    const logs = await loadLogs()
    logger.info('Conductor logs loaded successfully', {
      ...logContext,
      userId: auth.userId,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      logCount: logs.length,
    })
    return NextResponse.json({
      success: true,
      data: logs,
      meta: { total: logs.length },
    })
  } catch (error) {
    logger.error('Failed to load conductor logs', error, {
      ...logContext,
      userId: auth.userId,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json(
      { success: false, error: 'Failed to load logs' },
      { status: 500 }
    )
  }
}
