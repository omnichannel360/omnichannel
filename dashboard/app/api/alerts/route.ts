import { NextRequest, NextResponse } from 'next/server'
import { atomicUpdate, atomicRead } from '@/lib/atomic-file-ops'
import { generatePrefixedId } from '@/lib/uuid'
import { logger, createLogContext } from '@/lib/logger'
import { validateBody } from '@/lib/validation/middleware'
import { AlertCreateBodySchema, AlertUpdateBodySchema, type AlertCreateBody, type AlertUpdateBody } from '@/lib/validation/schemas'
import path from 'path'
import { AlertSchema } from '@/lib/validation/schemas'
import { protectRouteMulti, type RouteHandler } from '@/lib/protected-route'
import {
  extractCorrelationFromRequest,
  createSuccessResponse,
  handleRouteError,
  formatErrorLog,
  withTimeout,
  sanitizeErrorDetails,
} from '@/lib/error-handling'
import type { Alert as AlertInput } from '@/lib/validation/schemas'

type Alert = AlertInput & {
  id: string
  timestamp: string
  status: 'active' | 'resolved'
}

const ALERTS_FILE = path.join(process.cwd(), 'data', 'alerts.json')

const alertHandlers = protectRouteMulti(
  {
    GET: async (request: NextRequest, { userId }) => {
      const requestId = extractCorrelationFromRequest(request.headers)
      const startTime = Date.now()


      const logContext = createLogContext({
        method: request.method,
        path: request.nextUrl.pathname,
        userId,
        operation: 'load_alerts',
        requestId,
      })

      try {
        const alerts = await withTimeout(
          atomicRead<Alert[]>(ALERTS_FILE, []),
          30000,
          'Load alerts timeout'
        )
        const responseTime = Date.now() - startTime

        logger.info('Alerts loaded successfully', {
          ...logContext,
          statusCode: 200,
          responseTimeMs: responseTime,
          alertCount: alerts.length,
        })

        const response = NextResponse.json(
          createSuccessResponse({ alerts, total: alerts.length }, requestId)
        )
        response.headers.set('x-correlation-id', requestId)
        return response
      } catch (error) {
        const responseTime = Date.now() - startTime
        const { response, statusCode } = handleRouteError(error, requestId, {
          method: request.method,
          path: request.nextUrl.pathname,
          userId,
          operation: 'load_alerts',
        })

        logger.error(
          'Failed to load alerts',
          error,
          formatErrorLog('Load alerts error', error, {
            ...logContext,
            statusCode,
            responseTimeMs: responseTime,
          })
        )

        response.headers.set('x-correlation-id', requestId)
        return response
      }
    },

    POST: async (request: NextRequest, { userId }) => {
      const requestId = extractCorrelationFromRequest(request.headers)
      const startTime = Date.now()


      const logContext = createLogContext({
        method: request.method,
        path: request.nextUrl.pathname,
        userId,
        operation: 'create_alert',
        requestId,
      })

      try {
        const bodyResult = await validateBody<AlertCreateBody>(request, AlertCreateBodySchema)
        if (!bodyResult.success) {
          if (!(bodyResult.response instanceof NextResponse)) {
            throw new Error('Validation error response is not a NextResponse')
          }
          logger.warn('Alert creation validation failed', {
            ...logContext,
            statusCode: bodyResult.response.status,
            responseTimeMs: Date.now() - startTime,
          })
          const resp = bodyResult.response
          resp.headers.set('x-correlation-id', requestId)
          return resp
        }

        const newAlert: Alert = {
          id: generatePrefixedId('alert'),
          timestamp: new Date().toISOString(),
          ...bodyResult.data,
          status: 'active',
        }

        await atomicUpdate<Alert[]>(
          ALERTS_FILE,
          (alerts) => [...alerts, newAlert],
          []
        )

        const responseTime = Date.now() - startTime
        logger.info('Alert created successfully', {
          ...logContext,
          statusCode: 201,
          responseTimeMs: responseTime,
          alertId: newAlert.id,
        })

        const response = NextResponse.json(
          createSuccessResponse({ alert: newAlert }, requestId),
          { status: 201 }
        )
        response.headers.set('x-correlation-id', requestId)
        return response
      } catch (error) {
        const responseTime = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : 'Failed to create alert'
        const errorType = error instanceof Error ? error.constructor.name : typeof error

        const { response, statusCode } = handleRouteError(error, requestId, {
          method: request.method,
          path: request.nextUrl.pathname,
          userId,
          operation: 'create_alert',
        })

        logger.error('Alert creation failed', error, formatErrorLog('Create alert error', error, {
          ...logContext,
          statusCode,
          responseTimeMs: responseTime,
          errorMessage,
          errorType,
        }))

        response.headers.set('x-correlation-id', requestId)
        return response
      }
    },

    PATCH: async (request: NextRequest, { userId }) => {
      const requestId = extractCorrelationFromRequest(request.headers)
      const startTime = Date.now()


      const logContext = createLogContext({
        method: request.method,
        path: request.nextUrl.pathname,
        userId,
        operation: 'update_alert',
        requestId,
      })

      try {
        const bodyResult = await validateBody<AlertUpdateBody>(request, AlertUpdateBodySchema)
        if (!bodyResult.success) {
          if (!(bodyResult.response instanceof NextResponse)) {
            throw new Error('Validation error response is not a NextResponse')
          }
          logger.warn('Alert update validation failed', {
            ...logContext,
            statusCode: bodyResult.response.status,
            responseTimeMs: Date.now() - startTime,
          })
          const resp = bodyResult.response
          resp.headers.set('x-correlation-id', requestId)
          return resp
        }

        const { alert_id, status } = bodyResult.data

        const result = await atomicUpdate<Alert[]>(
          ALERTS_FILE,
          (alerts) => {
            const index = alerts.findIndex((a) => a.id === alert_id)
            if (index === -1) throw new Error('Alert not found')
            return [...alerts.slice(0, index), { ...alerts[index], status }, ...alerts.slice(index + 1)]
          },
          []
        )

        const updated = result.find((a) => a.id === alert_id)
        if (!updated) {
          throw new Error(`Alert with id ${alert_id} not found after update`)
        }
        const responseTime = Date.now() - startTime

        logger.info('Alert updated successfully', {
          ...logContext,
          statusCode: 200,
          responseTimeMs: responseTime,
          alertId: alert_id,
          newStatus: status,
        })

        const response = NextResponse.json(
          createSuccessResponse({ alert: updated }, requestId)
        )
        response.headers.set('x-correlation-id', requestId)
        return response
      } catch (error) {
        const responseTime = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : 'Failed to update alert'

        const { response, statusCode } = handleRouteError(error, requestId, {
          method: request.method,
          path: request.nextUrl.pathname,
          userId,
          operation: 'update_alert',
        })

        logger.error('Alert update failed', error, formatErrorLog('Update alert error', error, {
          ...logContext,
          statusCode,
          responseTimeMs: responseTime,
          errorMessage,
        }))

        response.headers.set('x-correlation-id', requestId)
        return response
      }
    },
  },
  { requireAuth: true, rateLimitKey: 'alerts' }
)

export const { GET, POST, PATCH } = alertHandlers
