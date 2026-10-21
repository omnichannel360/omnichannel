import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { TaskCreateSchema, TaskUpdateSchema, generateId } from '@/lib/validation'
import { parseRequestJson, jsonParseErrorResponse } from '@/lib/json-utils'
import { atomicUpdate, atomicRead, atomicWrite } from '@/lib/atomic-file-ops'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'

interface Task {
  id: string
  title: string
  status: 'todo' | 'in-progress' | 'done'
  assignee?: string
  dueDate?: string
}

const DATA_FILE = path.join(process.cwd(), 'data', 'kanban.json')

const DEFAULT_TASKS: Task[] = [
  { id: generateId('task'), title: 'Complete API design', status: 'done' as const },
  { id: generateId('task'), title: 'Implement authentication', status: 'in-progress' },
  { id: generateId('task'), title: 'Write tests', status: 'todo' },
]

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'kanban')
  if (rateLimitError) return rateLimitError

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
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'kanban')
  if (rateLimitError) return rateLimitError

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
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'kanban')
  if (rateLimitError) return rateLimitError

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

    // Atomic operation: load → find → update → save in single critical section
    const result = await atomicUpdate<Task[], Task>(DATA_FILE, async (tasks) => {
      const workingTasks = tasks.length ? tasks : DEFAULT_TASKS
      const taskIndex = workingTasks.findIndex(t => t.id === id)

      if (taskIndex === -1) {
        throw new Error('Task not found')
      }

      // Apply updates using immutable pattern
      const updatedTask: Task = {
        ...workingTasks[taskIndex],
        ...Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined)
        ),
      }
      const updated = [...workingTasks.slice(0, taskIndex), updatedTask, ...workingTasks.slice(taskIndex + 1)]
      return { updated, result: updatedTask }
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update task'
    if (message === 'Task not found') {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'kanban')
  if (rateLimitError) return rateLimitError

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

    // Atomic operation: load → filter → save in single critical section
    await atomicUpdate<Task[], void>(DATA_FILE, async (tasks) => {
      const workingTasks = tasks.length ? tasks : DEFAULT_TASKS
      const filtered = workingTasks.filter(t => t.id !== id)

      if (filtered.length === workingTasks.length) {
        throw new Error('Task not found')
      }

      return { updated: filtered, result: undefined }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete task'
    if (message === 'Task not found') {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
