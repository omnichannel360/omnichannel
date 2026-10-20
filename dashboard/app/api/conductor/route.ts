import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

interface ConversationLog {
  timestamp: string
  userMessage: string
  conductorResponse: string
  dispatchedAgents?: string[]
}

const LOG_FILE = path.join(process.cwd(), 'data', 'conductor-logs.json')

function ensureDataDir() {
  const dir = path.dirname(LOG_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function loadLogs(): ConversationLog[] {
  ensureDataDir()
  if (!fs.existsSync(LOG_FILE)) return []
  const data = fs.readFileSync(LOG_FILE, 'utf-8')
  return JSON.parse(data)
}

function saveLogs(logs: ConversationLog[]) {
  ensureDataDir()
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2))
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
  try {
    const body = await request.json()
    const { message } = body

    if (!message || !message.trim()) {
      return NextResponse.json(
        { success: false, error: 'Message required' },
        { status: 400 }
      )
    }

    const task = parseTaskFromMessage(message)

    const response =
      task.agents.length === 1 && task.agents[0] === 'conductor'
        ? `Processing: ${task.action}. No specific agents assigned. Awaiting clarification.`
        : `Dispatching "${task.action}" to: ${task.agents.join(', ')}. Task logged and agents notified.`

    const logs = loadLogs()
    logs.push({
      timestamp: new Date().toISOString(),
      userMessage: message,
      conductorResponse: response,
      dispatchedAgents: task.agents,
    })
    saveLogs(logs)

    return NextResponse.json({
      success: true,
      response,
      dispatchedAgents: task.agents,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const logs = loadLogs()
    return NextResponse.json({
      success: true,
      data: logs,
      meta: { total: logs.length },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to load logs' },
      { status: 500 }
    )
  }
}
