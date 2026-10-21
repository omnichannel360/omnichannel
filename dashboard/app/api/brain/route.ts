import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { atomicRead } from '@/lib/atomic-file-ops'
import { atomicReaddir } from '@/lib/atomic-dir-ops'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { generateId } from '@/lib/validation'
import { createLogger, createLogContext } from '@/lib/logger'
import { validateQuery } from '@/lib/validation/middleware'
import { BrainQuerySchema, type BrainQuery } from '@/lib/validation/schemas'
import { protectRoute, type RouteHandler } from '@/lib/protected-route'
import {
  extractCorrelationFromRequest,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  getHttpStatus,
  handleRouteError,
  formatErrorLog,
} from '@/lib/error-handling'

const logger = createLogger('brain-api')

interface Memory {
  id: string
  timestamp: string
  action: string
  result: string
  category: string
}

interface BrainResponse {
  total_memories: number
  recent: Memory[]
  categories: Record<string, number>
}

interface MemoryData {
  id?: string
  timestamp?: string
  action?: string
  result?: string
  category?: string
}

const BRAIN_DIR = path.join(process.cwd(), '..', 'company-brain')

export const GET = protectRoute(
  async (request: NextRequest, { userId }) => {
    const requestId = extractCorrelationFromRequest(request.headers)
    const startTime = Date.now()

    // Apply rate limiting
    const rateLimitError = await applyRateLimit(request, 'brain')
    if (rateLimitError) return rateLimitError

    const logContext = createLogContext({
      method: request.method,
      path: request.nextUrl.pathname,
      userId,
      operation: 'query_brain',
      requestId,
    })

    try {
      // Validate query parameters with Zod schema
      const queryResult = await validateQuery<BrainQuery>(request, BrainQuerySchema)
      if (!queryResult.success) {
        const validationError = queryResult.response as NextResponse
        logger.warn('Brain query validation failed', {
          ...logContext,
          statusCode: validationError.status,
          responseTimeMs: Date.now() - startTime,
        })
        return validationError
      }

      const { category, limit } = queryResult.data

      // FIX: Use atomicReaddir to prevent race condition
      // - Previous code: fs.stat() → fs.readdir() (race with mkdir/delete)
      // - Fixed code: atomicReaddir() holds lock during mkdir + readdir
      let files: string[] = []
      try {
        const allFiles = await atomicReaddir(BRAIN_DIR)
        files = allFiles.filter(f => f.endsWith('.json'))
      } catch (error) {
        // Log directory read error but return empty response (graceful degradation)
        logger.warn('Failed to read brain directory', error, {
          ...logContext,
          statusCode: 200,
          responseTimeMs: Date.now() - startTime,
          operation: 'read_brain_dir',
        })
        const response = NextResponse.json(
          createSuccessResponse(
            {
              total_memories: 0,
              recent: [],
              categories: {},
            } as BrainResponse,
            requestId
          )
        )
        response.headers.set('x-correlation-id', requestId)
        return response
      }

      const memories: Memory[] = []
      const categoryCount: Record<string, number> = {}
      const seenIds = new Set<string>()
      let fileReadErrors = 0

      // Read files sequentially with atomic locks to prevent race conditions
      // and ensure consistent snapshots of individual memory records
      for (const file of files) {
        try {
          const data = await atomicRead<MemoryData[] | Record<string, unknown>>(path.join(BRAIN_DIR, file))
          if (Array.isArray(data)) {
            data.forEach((mem: MemoryData) => {
              const id = mem.id || generateId('memory')
              const cat = mem.category || 'general'

              // Prevent duplicate IDs from being counted twice
              if (!seenIds.has(id)) {
                seenIds.add(id)
                categoryCount[cat] = (categoryCount[cat] || 0) + 1

                if (!category || mem.category === category) {
                  memories.push({
                    id,
                    timestamp: mem.timestamp || new Date().toISOString(),
                    action: mem.action || '',
                    result: mem.result || '',
                    category: cat,
                  })
                }
              }
            })
          }
        } catch (error) {
          fileReadErrors++
          logger.warn(`Failed to parse memory file`, {
            ...logContext,
            file,
            error: error instanceof Error ? error.message : String(error),
            operation: 'parse_memory_file',
          })
        }
      }

      const recent = memories.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ).slice(0, limit)

      logger.info('Brain query completed successfully', {
        ...logContext,
        statusCode: 200,
        responseTimeMs: Date.now() - startTime,
        totalMemories: memories.length,
        recentCount: recent.length,
        categoriesCount: Object.keys(categoryCount).length,
        fileReadErrors,
      })

      const response = NextResponse.json(
        createSuccessResponse(
          {
            total_memories: memories.length,
            recent,
            categories: categoryCount,
          } as BrainResponse,
          requestId
        )
      )
      response.headers.set('x-correlation-id', requestId)
      return response
    } catch (error) {
      const { response, statusCode } = handleRouteError(error, requestId, {
        method: request.method,
        path: request.nextUrl.pathname,
        userId,
        operation: 'query_brain',
      })

      logger.error('Brain query failed', error, formatErrorLog('Brain query error', error, {
        ...logContext,
        statusCode,
        responseTimeMs: Date.now() - startTime,
      }))

      response.headers.set('x-correlation-id', requestId)
      return response
    }
  },
  { requireAuth: true, rateLimitKey: 'brain' }
)
