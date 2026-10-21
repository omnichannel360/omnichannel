import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { TaskCreateSchema, TaskUpdateSchema } from '@/lib/validation'
import { parseRequestJson, jsonParseErrorResponse } from '@/lib/json-utils'
import { withFileLock } from '@/lib/file-lock'

interface Task {
  id: string
  title: string
  status: 'todo' | 'in-progress' | 'done'
  assignee?: string
  dueDate?: string
}

const DATA_FILE = path.join(process.cwd(), 'data', 'kanban.json')

const DEFAULT_TASKS: Task[] = [
  { id: crypto.randomUUID(), title: 'Complete API design', status: 'done' as const },
  { id: crypto.randomUUID(), title: 'Implement authentication', status: 'in-progress' },
  { id: crypto.randomUUID(), title: 'Write tests', status: 'todo' },
]

async function ensureDataDir(): Promise<void> {
  const dir = path.dirname(DATA_FILE)
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // Already exists
  }
}

async function loadTasks(): Promise<Task[]> {
  return withFileLock(DATA_FILE, async () => {
    await ensureDataDir()
    try {
      const data = await fs.readFile(DATA_FILE, 'utf-8')
      try {
        return JSON.parse(data)
      } catch (parseError) {
        // File exists but contains invalid JSON - this is a corruption error
        throw new Error('Tasks file is corrupted or contains invalid JSON')
      }
    } catch (error) {
      // If file doesn't exist, initialize with defaults
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        await fs.writeFile(DATA_FILE, JSON.stringify(DEFAULT_TASKS, null, 2), 'utf-8')
        return DEFAULT_TASKS
      }
      // Re-throw corruption or other errors to be handled by API endpoint
      throw error
    }
  })
}

async function saveTasks(tasks: Task[]): Promise<void> {
  return withFileLock(DATA_FILE, async () => {
    try {
      await ensureDataDir()
      await fs.writeFile(DATA_FILE, JSON.stringify(tasks, null, 2), 'utf-8')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to save tasks: ${message}`)
    }
  })
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  try {
    const tasks = await loadTasks()
    return NextResponse.json({ success: true, data: tasks })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to load tasks' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const parsed = await parseRequestJson(request)
  if (!parsed.success) {
    return jsonParseErrorResponse()
  }

  const body = parsed.body
  // Validate body against schema
  const parsedBody = TaskCreateSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const tasks = await loadTasks()
    const { title, status } = parsedBody.data
    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      status,
    }

    tasks.push(newTask)
    await saveTasks(tasks)

    return NextResponse.json({ success: true, data: newTask }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to create task' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const parsed = await parseRequestJson(request)
  if (!parsed.success) {
    return jsonParseErrorResponse()
  }

  const body = parsed.body
  // Validate body against schema
  const parsedBody = TaskUpdateSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const { id, ...updates } = parsedBody.data
    const tasks = await loadTasks()
    const taskIndex = tasks.findIndex(t => t.id === id)

    if (taskIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      )
    }

    // Apply updates using immutable pattern
    const updatedTask: Task = {
      ...tasks[taskIndex],
      ...Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      ),
    }
    const updatedTasks = [...tasks.slice(0, taskIndex), updatedTask, ...tasks.slice(taskIndex + 1)]
    await saveTasks(updatedTasks)

    return NextResponse.json({ success: true, data: updatedTask })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to update task' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID required' },
        { status: 400 }
      )
    }

    const tasks = await loadTasks()
    const filtered = tasks.filter(t => t.id !== id)

    if (filtered.length === tasks.length) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      )
    }

    await saveTasks(filtered)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete task' },
      { status: 500 }
    )
  }
}
