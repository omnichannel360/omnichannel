import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { TaskCreateSchema, TaskUpdateSchema } from '@/lib/validation'
import { parseRequestJson, jsonParseErrorResponse } from '@/lib/json-utils'

interface Task {
  id: string
  title: string
  status: 'todo' | 'in-progress' | 'done'
  assignee?: string
  dueDate?: string
}

const DATA_FILE = path.join(process.cwd(), 'data', 'kanban.json')

const DEFAULT_TASKS: Task[] = [
  { id: randomUUID(), title: 'Complete API design', status: 'done' },
  { id: randomUUID(), title: 'Implement authentication', status: 'in-progress' },
  { id: randomUUID(), title: 'Write tests', status: 'todo' },
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
  await ensureDataDir()
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8')
    try {
      return JSON.parse(data)
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : 'Unknown parse error'
      console.error('[KanbanAPI] JSON parse error:', message)
      // Return defaults on parse error
      await fs.writeFile(DATA_FILE, JSON.stringify(DEFAULT_TASKS, null, 2), 'utf-8')
      return DEFAULT_TASKS
    }
  } catch (error) {
    await fs.writeFile(DATA_FILE, JSON.stringify(DEFAULT_TASKS, null, 2), 'utf-8')
    return DEFAULT_TASKS
  }
}

async function saveTasks(tasks: Task[]): Promise<void> {
  try {
    await ensureDataDir()
    await fs.writeFile(DATA_FILE, JSON.stringify(tasks, null, 2), 'utf-8')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Failed to save tasks: ${message}`)
  }
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
    return jsonParseErrorResponse(parsed.error || 'Failed to parse request')
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
      id: randomUUID(),
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
    return jsonParseErrorResponse(parsed.error || 'Failed to parse request')
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
