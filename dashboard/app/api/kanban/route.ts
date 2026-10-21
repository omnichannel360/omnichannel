import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import crypto from 'crypto'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { TaskCreateSchema, TaskUpdateSchema } from '@/lib/validation'
import { parseRequestJson, jsonParseErrorResponse } from '@/lib/json-utils'
import { atomicUpdate, atomicRead } from '@/lib/atomic-file-ops'

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

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  try {
    const tasks = await atomicRead<Task[]>(DATA_FILE)
    return NextResponse.json({ success: true, data: tasks.length ? tasks : DEFAULT_TASKS })
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
    const { title, status } = parsedBody.data
    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      status,
    }

    // Atomic operation: load → add → save in single critical section
    const result = await atomicUpdate<Task[], Task>(DATA_FILE, async (tasks) => {
      const updated = [...(tasks.length ? tasks : DEFAULT_TASKS), newTask]
      return { updated, result: newTask }
    })

    return NextResponse.json({ success: true, data: result }, { status: 201 })
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
