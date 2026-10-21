import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
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
    return JSON.parse(data)
  } catch {
    const defaults: Task[] = [
      { id: crypto.randomUUID(), title: 'Complete API design', status: 'done' },
      { id: crypto.randomUUID(), title: 'Implement authentication', status: 'in-progress' },
      { id: crypto.randomUUID(), title: 'Write tests', status: 'todo' },
    ]
    await fs.writeFile(DATA_FILE, JSON.stringify(defaults, null, 2))
    return defaults
  }
}

async function saveTasks(tasks: Task[]) {
  await ensureDataDir()
  await fs.writeFile(DATA_FILE, JSON.stringify(tasks, null, 2))
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  try {
    const tasks = loadTasks()
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

  try {
    const body = await request.json()
    const { title, status = 'todo' } = body

    if (!title) {
      return NextResponse.json(
        { success: false, error: 'Title required' },
        { status: 400 }
      )
    }

    const tasks = loadTasks()
    const newTask: Task = {
      id: Date.now().toString(),
      title,
      status,
    }

    tasks.push(newTask)
    saveTasks(tasks)

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

  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID required' },
        { status: 400 }
      )
    }

    const tasks = loadTasks()
    const task = tasks.find(t => t.id === id)

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      )
    }

    Object.assign(task, updates)
    saveTasks(tasks)

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

    const tasks = loadTasks()
    const filtered = tasks.filter(t => t.id !== id)

    if (filtered.length === tasks.length) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      )
    }

    saveTasks(filtered)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete task' },
      { status: 500 }
    )
  }
}
