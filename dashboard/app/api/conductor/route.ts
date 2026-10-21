import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { withFileLock } from '@/lib/file-lock'
import { ensureDataDir } from '@/lib/ensure-dir'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { createLogger, createLogContext } from '@/lib/logger'
import { validateBody } from '@/lib/validation/middleware'
import { ConductorRequestSchemaComprehensive, type ConductorRequestMessage } from '@/lib/validation/schemas'
import { protectRouteMulti } from '@/lib/protected-route'
import {
  extractCorrelationFromRequest,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  formatErrorLog,
  getErrorDetails,
} from '@/lib/error-handling'

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

async function loadSkillRegistry(requestId: string): Promise<SkillRegistry | null> {
  try {
    const data = await fs.readFile(SKILL_REGISTRY_PATH, 'utf-8')
    try {
      return JSON.parse(data)
    } catch (parseError) {
      logger.error('Failed to parse skill registry', parseError, {
        requestId,
        operation: 'parse_skill_registry',
        path: SKILL_REGISTRY_PATH,
      })
      return null
    }
  } catch (readError) {
    logger.warn('Failed to load skill registry', {
      requestId,
      operation: 'load_skill_registry',
      path: SKILL_REGISTRY_PATH,
      error: readError instanceof Error ? readError.message : String(readError),
    })
    return null
  }
}

async function loadLogs(requestId: string): Promise<ConversationLog[]> {
  return withFileLock(LOG_FILE, async () => {
    await ensureDataDir(path.dirname(LOG_FILE))
    try {
      const data = await fs.readFile(LOG_FILE, 'utf-8')
      try {
        return JSON.parse(data)
      } catch (parseError) {
        logger.error('Failed to parse conductor logs', parseError, {
          requestId,
          operation: 'parse_conductor_logs',
          path: LOG_FILE,
        })
        return []
      }
    } catch (readError) {
      logger.error('Failed to read conductor logs', readError, {
        requestId,
        operation: 'read_conductor_logs',
        path: LOG_FILE,
      })
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
  const lowerMessage = message.toLowerCase()

  // Use word boundary regex to prevent false positives
  // "test" matches "test X" but not "testing" or "attestation"
  if (/\btest\b/.test(lowerMessage)) agents.push('test-automation-1', 'test-automation-2')
  if (/\b(fix|bug|debug|error|issue)\b/.test(lowerMessage)) agents.push('bug-fixer-1', 'bug-fixer-2')
  if (/\b(code|deploy|deployment|build)\b/.test(lowerMessage)) agents.push('backend-dev-node', 'devops-engineer-1')
  if (/\b(design|ui|ux|layout|visual)\b/.test(lowerMessage)) agents.push('ui-designer-web', 'design-director')
  if (/\b(analyze|analysis|report|metric|data)\b/.test(lowerMessage)) agents.push('data-engineer', 'analytics-engineer')
  if (/\b(review|audit|inspect|check|verify)\b/.test(lowerMessage)) agents.push('code-reviewer', 'backend-reviewer', 'frontend-reviewer')

  const uniqueAgents = [...new Set(agents)]

  return {
    action: message.split(' ').slice(0, 2).join(' '),
    agents: uniqueAgents.length > 0 ? uniqueAgents : ['conductor'],
    description: message,
  }
}

const conductorHandlers = protectRouteMulti(
  {
    POST: async (request: NextRequest, { userId }) => {
      const startTime = Date.now()
      const requestId = extractCorrelationFromRequest(request)
      const logContext = createLogContext({
        method: request.method,
        path: request.nextUrl.pathname,
        operation: 'dispatch_task',
        requestId,
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

      try {
        // Validate request body with comprehensive Zod schema
        const bodyResult = await validateBody<ConductorRequestMessage>(request, ConductorRequestSchemaComprehensive)
        if (!bodyResult.success) {
          return bodyResult.response
        }

        const { message } = bodyResult.data

        const registry = await loadSkillRegistry(requestId)
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

        const logs = await loadLogs(requestId)
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
          userId,
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
          userId,
          statusCode: 500,
          responseTimeMs: Date.now() - startTime,
        })
        return NextResponse.json(
          { success: false, error: 'Failed to process request' },
          { status: 500 }
        )
      }
    },

    GET: async (request: NextRequest, { userId }) => {
      const startTime = Date.now()
      const requestId = extractCorrelationFromRequest(request)
      const logContext = createLogContext({
        method: request.method,
        path: request.nextUrl.pathname,
        operation: 'load_conductor_logs',
        requestId,
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

      try {
        const logs = await loadLogs(requestId)
        logger.info('Conductor logs loaded successfully', {
          ...logContext,
          userId,
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
          userId,
          statusCode: 500,
          responseTimeMs: Date.now() - startTime,
        })
        return NextResponse.json(
          { success: false, error: 'Failed to load logs' },
          { status: 500 }
        )
      }
    },
  },
  { requireAuth: true, rateLimitKey: 'conductor' }
)

export const { POST, GET } = conductorHandlers
