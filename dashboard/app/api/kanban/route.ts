import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { TaskCreateSchema, TaskUpdateSchema, generateId } from '@/lib/validation'
import { parseRequestJson, jsonParseErrorResponse } from '@/lib/json-utils'
import { atomicUpdate, atomicRead, atomicWrite } from '@/lib/atomic-file-ops'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { createLogger, LogContext } from '@/lib/logger'
import { extractRequestContext, getOrCreateCorrelationId } from '@/lib/middleware/error-context'

const logger = createLogger('kanban-api')

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
    logger.warn('Unauthorized kanban GET attempt', {
      method: request.method,
      path: request.nextUrl.pathname,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,
    operation: 'load_tasks',
  })

  try {
    const tasks = await atomicRead<Task[]>(DATA_FILE)
    logger.info('Tasks loaded successfully', {
      ...logContext,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      taskCount: tasks.length || DEFAULT_TASKS.length,
    })
    return NextResponse.json({ success: true, data: tasks.length ? tasks : DEFAULT_TASKS })
  } catch (error) {
    logger.error('Failed to load tasks', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
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
    logger.warn('Unauthorized kanban POST attempt', {
      method: request.method,
      path: request.nextUrl.pathname,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,
    operation: 'create_task',
  })

  const parsed = await parseRequestJson(request)
  if (!parsed.success) {
    logger.warn('Failed to parse kanban POST request', {
      ...logContext,
      statusCode: 400,
    })
    return jsonParseErrorResponse()
  }

  const body = parsed.body
  // Validate body against schema
  const parsedBody = TaskCreateSchema.safeParse(body)
  if (!parsedBody.success) {
    logger.warn('Invalid task creation request', {
      ...logContext,
      statusCode: 400,
      validationErrors: parsedBody.error.flatten().fieldErrors,
    })
    return NextResponse.json(
      { success: false, error: 'Invalid request', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const { title, status } = parsedBody.data
    const newTask: Task = {
      id: generateId('task'),
      title,
      status,
    }

    // Atomic operation: load → add → save in single critical section
    const result = await atomicUpdate<Task[], Task>(DATA_FILE, async (tasks) => {
      const updated = [...(tasks.length ? tasks : DEFAULT_TASKS), newTask]
      return { updated, result: newTask }
    })

    logger.info('Task created successfully', {
      ...logContext,
      statusCode: 201,
      responseTimeMs: Date.now() - startTime,
      taskId: newTask.id,
      taskTitle: title,
    })

    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (error) {
    logger.error('Failed to create task', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
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
    logger.warn('Unauthorized kanban PUT attempt', {
      method: request.method,
      path: request.nextUrl.pathname,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,
    operation: 'update_task',
  })

  const parsed = await parseRequestJson(request)
  if (!parsed.success) {
    logger.warn('Failed to parse kanban PUT request', {
      ...logContext,
      statusCode: 400,
    })
    return jsonParseErrorResponse()
  }

  const body = parsed.body
  // Validate body against schema
  const parsedBody = TaskUpdateSchema.safeParse(body)
  if (!parsedBody.success) {
    logger.warn('Invalid task update request', {
      ...logContext,
      statusCode: 400,
      validationErrors: parsedBody.error.flatten().fieldErrors,
    })
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

    logger.info('Task updated successfully', {
      ...logContext,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      taskId: id,
      fieldsUpdated: Object.keys(updates),
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update task'
    const statusCode = message === 'Task not found' ? 404 : 500

    logger.error('Failed to update task', error, {
      ...logContext,
      statusCode,
      responseTimeMs: Date.now() - startTime,
    })

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
    logger.warn('Unauthorized kanban DELETE attempt', {
      method: request.method,
      path: request.nextUrl.pathname,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const startTime = Date.now()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,
    operation: 'delete_task',
    taskId: id || 'unknown',
  })

  if (!id) {
    logger.warn('Delete task request missing ID', {
      ...logContext,
      statusCode: 400,
    })
    return NextResponse.json(
      { success: false, error: 'ID required' },
      { status: 400 }
    )
  }

  try {
    // Atomic operation: load → filter → save in single critical section
    await atomicUpdate<Task[], void>(DATA_FILE, async (tasks) => {
      const workingTasks = tasks.length ? tasks : DEFAULT_TASKS
      const filtered = workingTasks.filter(t => t.id !== id)

      if (filtered.length === workingTasks.length) {
        throw new Error('Task not found')
      }

      return { updated: filtered, result: undefined }
    })

    logger.info('Task deleted successfully', {
      ...logContext,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      taskId: id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete task'
    const statusCode = message === 'Task not found' ? 404 : 500

    logger.error('Failed to delete task', error, {
      ...logContext,
      statusCode,
      responseTimeMs: Date.now() - startTime,
    })

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
