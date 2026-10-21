/**
 * EXAMPLE: Protected Alerts Endpoint Implementation
 *
 * This file demonstrates best practices for protecting API endpoints
 * with the new auth middleware system.
 *
 * USE AS TEMPLATE FOR UPDATING OTHER ENDPOINTS
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthMiddleware } from '@/lib/auth-middleware'
import { validateBody, validateQuery } from '@/lib/validation/middleware'
import {
  AlertSchema,
  AlertCreateBodySchema,
  AlertUpdateBodySchema,
  type Alert as AlertType,
} from '@/lib/validation/schemas'
import { logger, createLogContext } from '@/lib/logger'
import { atomicRead, atomicUpdate } from '@/lib/atomic-file-ops'
import { generateId } from '@/lib/validation'
import path from 'path'

const ALERTS_FILE = path.join(process.cwd(), 'data', 'alerts.json')

/**
 * GET /api/alerts
 * Retrieve all alerts for the current user
 *
 * Required Headers:
 *   Authorization: Bearer <jwt-token>
 *
 * Status Codes:
 *   200 - Success
 *   400 - Invalid query parameters
 *   401 - Unauthorized (missing/invalid token)
 *   500 - Server error
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Step 1: Verify authentication (required for this endpoint)
  // All users can access their own alerts
  const authResult = await verifyAuthMiddleware(request, {
    requireAuth: true, // Enforce authentication
    auditLog: true, // Log auth attempts
  })

  // If auth failed, authResult is a NextResponse with 401 status
  if (authResult instanceof NextResponse) {
    return authResult
  }

  // Auth succeeded - extract user context
  const { userId, email, role } = authResult

  // Create structured log context for all logs in this handler
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId,
    operation: 'get_alerts',
  })

  try {
    logger.info('GET /api/alerts - Request received', logContext)

    // Step 2: Validate query parameters (if any)
    // Example: ?severity=critical&limit=10
    const url = new URL(request.url)
    const severity = url.searchParams.get('severity')
    const limitParam = url.searchParams.get('limit')

    // Validate limit is a valid number
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 100) : 50

    // Step 3: Load alerts from storage
    const alerts = await atomicRead<AlertType[]>(ALERTS_FILE, [])

    // Step 4: Filter alerts based on severity if requested
    let filteredAlerts = alerts
    if (severity && ['info', 'warning', 'critical'].includes(severity)) {
      filteredAlerts = alerts.filter((alert) => alert.level === severity)
    }

    // Step 5: Apply pagination
    const paginatedAlerts = filteredAlerts.slice(0, limit)

    logger.info('Alerts retrieved successfully', {
      ...logContext,
      count: paginatedAlerts.length,
      totalCount: alerts.length,
      duration: Date.now() - startTime,
    })

    // Step 6: Return success response
    return NextResponse.json({
      success: true,
      data: paginatedAlerts,
      meta: {
        total: alerts.length,
        returned: paginatedAlerts.length,
        limit,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    logger.error('Failed to retrieve alerts', error, {
      ...logContext,
      error: message,
      duration: Date.now() - startTime,
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve alerts',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/alerts
 * Create a new alert (admin/moderator only)
 *
 * Required Headers:
 *   Authorization: Bearer <jwt-token>
 *   Content-Type: application/json
 *
 * Request Body:
 *   {
 *     "level": "warning|critical|info",
 *     "component": "string",
 *     "message": "string"
 *   }
 *
 * Status Codes:
 *   201 - Alert created
 *   400 - Invalid request body
 *   401 - Unauthorized
 *   403 - Forbidden (insufficient role)
 *   413 - Request body too large
 *   500 - Server error
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Step 1: Verify authentication AND authorization
  // Only admins and moderators can create alerts
  const authResult = await verifyAuthMiddleware(request, {
    requireAuth: true,
    allowedRoles: ['admin', 'moderator'], // RBAC enforcement
    auditLog: true,
  })

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { userId, email, role } = authResult

  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId,
    role,
    operation: 'create_alert',
  })

  try {
    logger.info('POST /api/alerts - Request received', logContext)

    // Step 2: Validate request body
    const validation = await validateBody(request, AlertCreateBodySchema)
    if (!validation.success) {
      logger.warn('Alert validation failed', {
        ...logContext,
        error: 'Invalid request body',
      })
      return validation.response
    }

    const { level, component, message } = validation.data

    // Step 3: Generate new alert with ID and timestamp
    const alert: AlertType = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      level: level as 'info' | 'warning' | 'critical',
      component,
      message,
      status: 'active',
    }

    logger.info('Creating new alert', {
      ...logContext,
      alertId: alert.id,
      level: alert.level,
      component: alert.component,
    })

    // Step 4: Load existing alerts
    const alerts = await atomicRead<AlertType[]>(ALERTS_FILE, [])

    // Step 5: Add new alert and save
    const updated = [alert, ...alerts]
    await atomicUpdate(ALERTS_FILE, updated)

    logger.info('Alert created successfully', {
      ...logContext,
      alertId: alert.id,
      duration: Date.now() - startTime,
    })

    // Step 6: Return 201 Created
    return NextResponse.json(
      {
        success: true,
        data: alert,
      },
      { status: 201 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    logger.error('Failed to create alert', error, {
      ...logContext,
      error: message,
      duration: Date.now() - startTime,
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create alert',
      },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/alerts/:id
 * Update an alert (admin only)
 *
 * Required Headers:
 *   Authorization: Bearer <jwt-token>
 *   Content-Type: application/json
 *
 * URL Parameters:
 *   id - Alert ID to update
 *
 * Request Body:
 *   {
 *     "level"?: "warning|critical|info",
 *     "component"?: "string",
 *     "message"?: "string",
 *     "status"?: "active|resolved"
 *   }
 *
 * Status Codes:
 *   200 - Alert updated
 *   400 - Invalid request
 *   401 - Unauthorized
 *   403 - Forbidden
 *   404 - Alert not found
 *   500 - Server error
 */
export async function PUT(request: NextRequest) {
  const startTime = Date.now()

  // Step 1: Verify authentication and admin-only access
  const authResult = await verifyAuthMiddleware(request, {
    requireAuth: true,
    allowedRoles: ['admin'], // Admin-only
    auditLog: true,
  })

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { userId } = authResult

  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId,
    operation: 'update_alert',
  })

  try {
    // Step 2: Extract alert ID from URL
    const url = new URL(request.url)
    const pathSegments = url.pathname.split('/')
    const alertId = pathSegments[pathSegments.length - 1]

    if (!alertId) {
      logger.warn('Missing alert ID', logContext)
      return NextResponse.json(
        { success: false, error: 'Alert ID required' },
        { status: 400 }
      )
    }

    logger.info('Updating alert', {
      ...logContext,
      alertId,
    })

    // Step 3: Validate request body
    const validation = await validateBody(request, AlertUpdateBodySchema)
    if (!validation.success) {
      return validation.response
    }

    const updates = validation.data

    // Step 4: Load alerts and find the target
    const alerts = await atomicRead<AlertType[]>(ALERTS_FILE, [])
    const index = alerts.findIndex((a) => a.id === alertId)

    if (index === -1) {
      logger.warn('Alert not found', {
        ...logContext,
        alertId,
      })
      return NextResponse.json(
        { success: false, error: 'Alert not found' },
        { status: 404 }
      )
    }

    // Step 5: Apply updates
    const updated = {
      ...alerts[index],
      ...updates,
      id: alertId, // Prevent ID modification
      timestamp: alerts[index].timestamp, // Prevent timestamp modification
    }

    alerts[index] = updated

    // Step 6: Save and return
    await atomicUpdate(ALERTS_FILE, alerts)

    logger.info('Alert updated successfully', {
      ...logContext,
      alertId,
      updatedFields: Object.keys(updates),
      duration: Date.now() - startTime,
    })

    return NextResponse.json({
      success: true,
      data: updated,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    logger.error('Failed to update alert', error, {
      ...logContext,
      error: message,
      duration: Date.now() - startTime,
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update alert',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/alerts/:id
 * Delete an alert (admin only)
 *
 * Required Headers:
 *   Authorization: Bearer <jwt-token>
 *
 * URL Parameters:
 *   id - Alert ID to delete
 *
 * Status Codes:
 *   200 - Alert deleted
 *   401 - Unauthorized
 *   403 - Forbidden
 *   404 - Alert not found
 *   500 - Server error
 */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now()

  // Step 1: Verify admin access
  const authResult = await verifyAuthMiddleware(request, {
    requireAuth: true,
    allowedRoles: ['admin'],
    auditLog: true,
  })

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { userId } = authResult

  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId,
    operation: 'delete_alert',
  })

  try {
    const url = new URL(request.url)
    const pathSegments = url.pathname.split('/')
    const alertId = pathSegments[pathSegments.length - 1]

    if (!alertId) {
      return NextResponse.json(
        { success: false, error: 'Alert ID required' },
        { status: 400 }
      )
    }

    logger.info('Deleting alert', {
      ...logContext,
      alertId,
    })

    const alerts = await atomicRead<AlertType[]>(ALERTS_FILE, [])
    const index = alerts.findIndex((a) => a.id === alertId)

    if (index === -1) {
      return NextResponse.json(
        { success: false, error: 'Alert not found' },
        { status: 404 }
      )
    }

    const deleted = alerts.splice(index, 1)[0]
    await atomicUpdate(ALERTS_FILE, alerts)

    logger.info('Alert deleted successfully', {
      ...logContext,
      alertId,
      duration: Date.now() - startTime,
    })

    return NextResponse.json({
      success: true,
      data: deleted,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    logger.error('Failed to delete alert', error, {
      ...logContext,
      error: message,
      duration: Date.now() - startTime,
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete alert',
      },
      { status: 500 }
    )
  }
}
