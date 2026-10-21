import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { generateId } from '@/lib/validation'
import { validateBody } from '@/lib/validation/middleware'
import { KanbanItemSchema, type KanbanItem } from '@/lib/validation/schemas'
import { parseRequestJson, jsonParseErrorResponse } from '@/lib/json-utils'
import { atomicUpdate, atomicRead, atomicWrite } from '@/lib/atomic-file-ops'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { createLogger, LogContext, createLogContext } from '@/lib/logger'
import { extractRequestContext, getOrCreateCorrelationId } from '@/lib/middleware/error-context'
import { protectRouteMulti } from '@/lib/protected-route'
import {
  extractCorrelationFromRequest,
  handleRouteError,
  createSuccessResponse,
  ERROR_CODES,
  createErrorResponse,
} from '@/lib/error-handling'

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

const kanbanHandlers = protectRouteMulti(
  {
    GET: async (request: NextRequest, { userId }) => {
      const requestId = extractCorrelationFromRequest(request.headers)
      // Apply rate limiting
      const rateLimitError = await applyRateLimit(request, 'kanban')
      if (rateLimitError) return rateLimitError

      const startTime = Date.now()
      const logContext = createLogContext({
        method: request.method,
        path: request.nextUrl.pathname,
        userId,
        operation: 'load_tasks',
        requestId,
      })

      try {
        const tasks = await atomicRead<Task[]>(DATA_FILE)
        logger.info('Tasks loaded successfully', {
          ...logContext,
          statusCode: 200,
          responseTimeMs: Date.now() - startTime,
          taskCount: tasks.length || DEFAULT_TASKS.length,
        })
        const response = NextResponse.json(
          createSuccessResponse(tasks.length ? tasks : DEFAULT_TASKS, requestId)
        )
        response.headers.set('x-correlation-id', requestId)
        return response
      } catch (error) {
        const responseTime = Date.now() - startTime
        const { response, statusCode } = handleRouteError(error, requestId, {
          method: request.method,
          path: request.nextUrl.pathname,
          userId,
          operation: 'load_tasks',
        })
        logger.error('Failed to load tasks', error, {
          ...logContext,
          statusCode,
          responseTimeMs: responseTime,
        })
        response.headers.set('x-correlation-id', requestId)
        return response
      }
    },

    POST: async (request: NextRequest, { userId }) => {
      const requestId = extractCorrelationFromRequest(request.headers)
      // Apply rate limiting
      const rateLimitError = await applyRateLimit(request, 'kanban')
      if (rateLimitError) return rateLimitError

      const startTime = Date.now()
      const logContext = createLogContext({
        method: request.method,
        path: request.nextUrl.pathname,
        userId,
        operation: 'create_task',
        requestId,
      })

      try {
        // Validate body against schema
        const bodyResult = await validateBody<KanbanItem>(request, KanbanItemSchema)
        if (!bodyResult.success) {
          return bodyResult.response
        }

        const { title, status } = bodyResult.data
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

        const response = NextResponse.json(createSuccessResponse(result, requestId), { status: 201 })
        response.headers.set('x-correlation-id', requestId)
        return response
      } catch (error) {
        const responseTime = Date.now() - startTime
        const { response, statusCode } = handleRouteError(error, requestId, {
          method: request.method,
          path: request.nextUrl.pathname,
          userId,
          operation: 'create_task',
        })
        logger.error('Failed to create task', error, {
          ...logContext,
          statusCode,
          responseTimeMs: responseTime,
        })
        response.headers.set('x-correlation-id', requestId)
        return response
      }
    },

    PUT: async (request: NextRequest, { userId }) => {
      const requestId = extractCorrelationFromRequest(request.headers)
      // Apply rate limiting
      const rateLimitError = await applyRateLimit(request, 'kanban')
      if (rateLimitError) return rateLimitError

      const startTime = Date.now()
      const logContext = createLogContext({
        method: request.method,
        path: request.nextUrl.pathname,
        userId,
        operation: 'update_task',
        requestId,
      })

      try {
        // Validate body against schema
        const bodyResult = await validateBody<any>(request, KanbanItemSchema)
        if (!bodyResult.success) {
          return bodyResult.response
        }

        const { title, status } = bodyResult.data

        // Extract task ID from query parameter
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
          logger.warn('Update task request missing ID', {
            ...logContext,
            statusCode: 400,
          })
          return createErrorResponse(
            'Task ID is required',
            ERROR_CODES.VALIDATION_ERROR,
            requestId,
            400
          )
        }

        const updates: any = {}
        if (title !== undefined) updates.title = title
        if (status !== undefined) updates.status = status

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

        const response = NextResponse.json(createSuccessResponse(result, requestId))
        response.headers.set('x-correlation-id', requestId)
        return response
      } catch (error) {
        const responseTime = Date.now() - startTime
        const message = error instanceof Error ? error.message : 'Failed to update task'

        // Handle task not found specifically
        if (message === 'Task not found') {
          const response = createErrorResponse(
            'Task not found',
            ERROR_CODES.RESOURCE_NOT_FOUND,
            requestId,
            404
          )
          response.headers.set('x-correlation-id', requestId)
          logger.warn('Task not found during update', {
            ...logContext,
            statusCode: 404,
            responseTimeMs: responseTime,
          })
          return response
        }

        const { response, statusCode } = handleRouteError(error, requestId, {
          method: request.method,
          path: request.nextUrl.pathname,
          userId,
          operation: 'update_task',
        })
        logger.error('Failed to update task', error, {
          ...logContext,
          statusCode,
          responseTimeMs: responseTime,
        })
        response.headers.set('x-correlation-id', requestId)
        return response
      }
    },

    DELETE: async (request: NextRequest, { userId }) => {
      const requestId = extractCorrelationFromRequest(request.headers)
      // Apply rate limiting
      const rateLimitError = await applyRateLimit(request, 'kanban')
      if (rateLimitError) return rateLimitError

      const startTime = Date.now()
      const { searchParams } = new URL(request.url)
      const id = searchParams.get('id')

      const logContext = createLogContext({
        method: request.method,
        path: request.nextUrl.pathname,
        userId,
        operation: 'delete_task',
        taskId: id || 'unknown',
        requestId,
      })

      if (!id) {
        logger.warn('Delete task request missing ID', {
          ...logContext,
          statusCode: 400,
        })
        return createErrorResponse(
          'Task ID is required',
          ERROR_CODES.VALIDATION_ERROR,
          requestId,
          400
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

        const response = NextResponse.json(createSuccessResponse(undefined, requestId))
        response.headers.set('x-correlation-id', requestId)
        return response
      } catch (error) {
        const responseTime = Date.now() - startTime
        const message = error instanceof Error ? error.message : 'Failed to delete task'

        // Handle task not found specifically
        if (message === 'Task not found') {
          const response = createErrorResponse(
            'Task not found',
            ERROR_CODES.RESOURCE_NOT_FOUND,
            requestId,
            404
          )
          response.headers.set('x-correlation-id', requestId)
          logger.warn('Task not found during delete', {
            ...logContext,
            statusCode: 404,
            responseTimeMs: responseTime,
          })
          return response
        }

        const { response, statusCode } = handleRouteError(error, requestId, {
          method: request.method,
          path: request.nextUrl.pathname,
          userId,
          operation: 'delete_task',
        })
        logger.error('Failed to delete task', error, {
          ...logContext,
          statusCode,
          responseTimeMs: responseTime,
        })
        response.headers.set('x-correlation-id', requestId)
        return response
      }
    },
  },
  { requireAuth: true, rateLimitKey: 'kanban' }
)

export const { GET, POST, PUT, DELETE } = kanbanHandlers
