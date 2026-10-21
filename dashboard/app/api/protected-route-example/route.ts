/**
 * Example Protected API Route
 * Demonstrates how to use NextAuth.js and authentication helpers
 * to protect API endpoints with JWT verification and RBAC
 *
 * Usage:
 * POST /api/protected-route-example
 * Authorization: Bearer <jwt_token>
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, hasRole, hasPermission, getFullAuthContext } from '@/lib/auth-helpers'
import { logger, createLogContext } from '@/lib/logger'
import {
  extractCorrelationFromRequest,
  handleRouteError,
  createSuccessResponse,
} from '@/lib/error-handling'
import { generatePrefixedId } from '@/lib/uuid'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { validateCsrfMiddleware, setCsrfTokenCookie } from '@/lib/csrf-protection'

/**
 * GET /api/protected-route-example
 * Returns protected data for authenticated users
 */
export async function GET(request: NextRequest) {
  const correlationId = extractCorrelationFromRequest(request.headers)
  const startTime = Date.now()

  // Apply rate limiting (use 'protected' endpoint name - see lib/rate-limiting.ts)
  const rateLimitError = await applyRateLimit(request, 'protected')
  if (rateLimitError) return rateLimitError

  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    operation: 'get_protected_data',
    requestId: correlationId,
  })

  try {
    // Verify authentication
    const authVerification = verifyAuth(request)
    if (!authVerification.authenticated) {
      return authVerification.response!
    }

    const authContext = getFullAuthContext(request)

    // Example: Check for specific role
    if (!hasRole(request, ['admin', 'user'])) {
      logger.warn('Insufficient permissions for GET', {
        ...logContext,
        userId: authContext.userId,
        requiredRole: 'admin or user',
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
        },
        { status: 403 }
      )
    }

    // Example: Check for specific permission
    if (!hasPermission(request, 'read:own')) {
      logger.warn('Missing required permission', {
        ...logContext,
        userId: authContext.userId,
        requiredPermission: 'read:own',
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Missing required permission: read:own',
          code: 'PERMISSION_DENIED',
        },
        { status: 403 }
      )
    }

    // Authenticated and authorized - return protected data
    logger.info('Protected data retrieved successfully', {
      ...logContext,
      userId: authContext.userId,
      statusCode: 200,
    })

    const successResponse = createSuccessResponse(
      {
        message: 'Protected data retrieved',
        user: {
          id: authContext.userId,
          email: authContext.userEmail,
          role: authContext.userRole,
        },
        data: {
          example: 'This is protected data only visible to authenticated users',
          timestamp: new Date().toISOString(),
        },
      },
      correlationId
    )

    const response = NextResponse.json(successResponse)
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    const responseTime = Date.now() - startTime

    const { response, statusCode } = handleRouteError(error, correlationId, {
      method: request.method,
      path: request.nextUrl.pathname,
      operation: 'get_protected_data',
    })

    logger.error('Protected GET failed', error, {
      ...logContext,
      statusCode,
      responseTimeMs: responseTime,
    })

    return response
  }
}

/**
 * POST /api/protected-route-example
 * Creates a resource (admin only)
 *
 * @body { name: string, description: string, _csrf?: string }
 */
export async function POST(request: NextRequest) {
  const correlationId = extractCorrelationFromRequest(request.headers)
  const startTime = Date.now()

  // Apply rate limiting (use 'protected' endpoint name - see lib/rate-limiting.ts)
  const rateLimitError = await applyRateLimit(request, 'protected')
  if (rateLimitError) return rateLimitError

  // Validate CSRF token for state-changing request
  const csrfCheck = await validateCsrfMiddleware(request)
  if (!csrfCheck.valid) {
    return csrfCheck.response || NextResponse.json(
      { success: false, error: 'CSRF validation failed' },
      { status: 403 }
    )
  }

  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    operation: 'create_protected_resource',
    requestId: correlationId,
  })

  try {
    // Verify authentication
    const authVerification = verifyAuth(request)
    if (!authVerification.authenticated) {
      return authVerification.response!
    }

    const authContext = getFullAuthContext(request)

    // Require admin role for creation
    if (!hasRole(request, ['admin'])) {
      logger.warn('Insufficient role for POST', {
        ...logContext,
        userId: authContext.userId,
        userRole: authContext.userRole,
        requiredRole: 'admin',
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Admin role required',
          code: 'INSUFFICIENT_PERMISSIONS',
        },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { name, description } = body

    // SECURITY: Strict input validation
    // Name: required, string, 1-256 chars, alphanumeric + spaces/dashes/underscores
    // Description: optional, string, max 2048 chars
    if (
      !name ||
      typeof name !== 'string' ||
      name.length < 1 ||
      name.length > 256 ||
      !/^[a-zA-Z0-9\s_\-]{1,256}$/.test(name)
    ) {
      logger.warn('Invalid input - invalid name format', {
        ...logContext,
        userId: authContext.userId,
        nameLength: typeof name === 'string' ? name.length : 'not_string',
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Name must be 1-256 characters, alphanumeric with spaces/dashes/underscores only',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      )
    }

    // Validate description if provided
    if (description !== undefined && description !== null) {
      if (typeof description !== 'string' || description.length > 2048) {
        logger.warn('Invalid input - invalid description format', {
          ...logContext,
          userId: authContext.userId,
          descLength: typeof description === 'string' ? description.length : 'not_string',
        })

        return NextResponse.json(
          {
            success: false,
            error: 'Description must be a string with max 2048 characters',
            code: 'VALIDATION_ERROR',
          },
          { status: 400 }
        )
      }
    }

    // Example: Create resource with cryptographically secure ID
    const resource = {
      id: generatePrefixedId('resource'),
      name,
      description: description || '',
      createdBy: authContext.userId,
      createdAt: new Date().toISOString(),
    }

    logger.info('Protected resource created', {
      ...logContext,
      userId: authContext.userId,
      resourceId: resource.id,
      statusCode: 201,
    })

    const successResponse = createSuccessResponse(
      {
        message: 'Resource created successfully',
        resource,
      },
      correlationId
    )

    const response = NextResponse.json(successResponse, { status: 201 })
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    const responseTime = Date.now() - startTime

    const { response, statusCode } = handleRouteError(error, correlationId, {
      method: request.method,
      path: request.nextUrl.pathname,
      operation: 'create_protected_resource',
    })

    logger.error('Protected POST failed', error, {
      ...logContext,
      statusCode,
      responseTimeMs: responseTime,
    })

    return response
  }
}

/**
 * DELETE /api/protected-route-example/[id]
 * Deletes a resource (admin only)
 *
 * Demonstrates parameter extraction and authorization
 */
export async function DELETE(request: NextRequest) {
  const correlationId = extractCorrelationFromRequest(request.headers)
  const startTime = Date.now()

  // Apply rate limiting (use 'protected' endpoint name - see lib/rate-limiting.ts)
  const rateLimitError = await applyRateLimit(request, 'protected')
  if (rateLimitError) return rateLimitError

  // Validate CSRF token for state-changing request
  const csrfCheck = await validateCsrfMiddleware(request)
  if (!csrfCheck.valid) {
    return csrfCheck.response || NextResponse.json(
      { success: false, error: 'CSRF validation failed' },
      { status: 403 }
    )
  }

  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    operation: 'delete_protected_resource',
    requestId: correlationId,
  })

  try {
    // Verify authentication
    const authVerification = verifyAuth(request)
    if (!authVerification.authenticated) {
      return authVerification.response!
    }

    const authContext = getFullAuthContext(request)

    // Require admin role for deletion
    if (!hasRole(request, ['admin'])) {
      logger.warn('Insufficient role for DELETE', {
        ...logContext,
        userId: authContext.userId,
        userRole: authContext.userRole,
        requiredRole: 'admin',
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Admin role required',
          code: 'INSUFFICIENT_PERMISSIONS',
        },
        { status: 403 }
      )
    }

    // Extract resource ID from URL
    const resourceId = request.nextUrl.searchParams.get('id')
    if (!resourceId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing resource ID',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      )
    }

    // Example: Delete resource
    logger.info('Protected resource deleted', {
      ...logContext,
      userId: authContext.userId,
      resourceId,
      statusCode: 200,
    })

    const successResponse = createSuccessResponse(
      {
        message: 'Resource deleted successfully',
        resourceId,
      },
      correlationId
    )

    const response = NextResponse.json(successResponse)
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    const responseTime = Date.now() - startTime

    const { response, statusCode } = handleRouteError(error, correlationId, {
      method: request.method,
      path: request.nextUrl.pathname,
      operation: 'delete_protected_resource',
    })

    logger.error('Protected DELETE failed', error, {
      ...logContext,
      statusCode,
      responseTimeMs: responseTime,
    })

    return response
  }
}
