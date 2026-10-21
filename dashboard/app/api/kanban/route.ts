import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'

interface Task {
  id: string
  title: string
  status: 'todo' | 'in-progress' | 'done'
  assignee?: string
  dueDate?: string
}

const DATA_FILE = path.join(process.cwd(), 'data', 'kanban.json')

async function ensureDataDir() {
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
    await fs.access(DATA_FILE)
    const data = await fs.readFile(DATA_FILE, 'utf-8')
    try {
      return JSON.parse(data)
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : 'Unknown parse error'
      console.error('[KanbanAPI] JSON parse error:', message)
      // Return defaults on parse error
      const defaults: Task[] = [
        { id: crypto.randomUUID(), title: 'Complete API design', status: 'done' },
        { id: crypto.randomUUID(), title: 'Implement authentication', status: 'in-progress' },
        { id: crypto.randomUUID(), title: 'Write tests', status: 'todo' },
      ]
      await fs.writeFile(DATA_FILE, JSON.stringify(defaults, null, 2), 'utf-8')
      return defaults
    }
  } catch (error) {
    const defaults: Task[] = [
      { id: crypto.randomUUID(), title: 'Complete API design', status: 'done' },
      { id: crypto.randomUUID(), title: 'Implement authentication', status: 'in-progress' },
      { id: crypto.randomUUID(), title: 'Write tests', status: 'todo' },
    ]
    await fs.writeFile(DATA_FILE, JSON.stringify(defaults, null, 2), 'utf-8')
    return defaults
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

  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  const { title, status = 'todo' } = body as Record<string, unknown>

  if (!title) {
    return NextResponse.json(
      { success: false, error: 'Title required' },
      { status: 400 }
    )
  }

  try {
    const tasks = await loadTasks()
    const newTask: Task = {
      id: Date.now().toString(),
      title: String(title),
      status: String(status) as 'todo' | 'in-progress' | 'done',
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

  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  const { id, ...updates } = body as Record<string, unknown>

  if (!id) {
    return NextResponse.json(
      { success: false, error: 'ID required' },
      { status: 400 }
    )
  }

  try {
    const tasks = await loadTasks()
    const task = tasks.find(t => t.id === id)

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      )
    }

    Object.assign(task, updates)
    await saveTasks(tasks)

    return NextResponse.json({ success: true, data: task })
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
