/**
 * Authentication Helper Functions
 * Provides utilities for API routes to access and verify authentication context
 * Works with both NextAuth.js and JWT middleware
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { auth } from '@/auth.config'
import { logger } from './logger'
import { createErrorResponse, ERROR_CODES } from './error-handling'

export type UserRole = 'admin' | 'user' | 'viewer'

/**
 * Get authenticated user from request headers (set by middleware)
 * Returns user context injected by authentication middleware
 */
export function getAuthContextFromHeaders(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  const userEmail = request.headers.get('x-user-email')
  const userRole = request.headers.get('x-user-role')
  const authVerified = request.headers.get('x-auth-verified')
  const correlationId = request.headers.get('x-correlation-id')

  return {
    userId,
    userEmail,
    userRole: (userRole as UserRole) || 'user',
    authVerified: authVerified === 'true',
    correlationId: correlationId || 'unknown',
  }
}

/**
 * Get NextAuth session for the current request
 */
export async function getAuthSession() {
  try {
    const session = await getServerSession(auth)
    return session
  } catch (error) {
    logger.error('Failed to get NextAuth session', error, {
      component: 'auth-helpers',
      operation: 'getAuthSession',
    })
    return null
  }
}

/**
 * Verify that request is authenticated
 * Returns auth context or error response
 */
export function verifyAuth(request: NextRequest): {
  authenticated: boolean
  user?: {
    id: string
    email: string
    role: UserRole
  }
  error?: string
  response?: NextResponse
} {
  const authContext = getAuthContextFromHeaders(request)

  if (!authContext.authVerified || !authContext.userId) {
    const errorResponse = createErrorResponse(
      'Authentication required',
      ERROR_CODES.AUTH_INVALID,
      authContext.correlationId,
      401
    )

    return {
      authenticated: false,
      error: 'Not authenticated',
      response: errorResponse,
    }
  }

  return {
    authenticated: true,
    user: {
      id: authContext.userId,
      email: authContext.userEmail || 'unknown',
      role: authContext.userRole,
    },
  }
}

/**
 * Verify user has required role
 * Returns true if user has required role, false otherwise
 */
export function hasRole(request: NextRequest, requiredRoles: UserRole[]): boolean {
  const authContext = getAuthContextFromHeaders(request)

  if (!authContext.authVerified) {
    return false
  }

  return requiredRoles.includes(authContext.userRole)
}

/**
 * Verify user has specific permission based on role
 */
export function hasPermission(
  request: NextRequest,
  permission: string
): boolean {
  const authContext = getAuthContextFromHeaders(request)

  if (!authContext.authVerified) {
    return false
  }

  // Permission mapping by role
  const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
    admin: [
      'read:all',
      'write:all',
      'delete:all',
      'manage:users',
      'manage:settings',
      'view:analytics',
    ],
    user: [
      'read:own',
      'write:own',
      'read:shared',
      'create:content',
    ],
    viewer: [
      'read:public',
      'view:analytics:public',
    ],
  }

  const permissions = ROLE_PERMISSIONS[authContext.userRole] || []
  return permissions.includes(permission)
}

/**
 * Create unauthorized error response
 */
export function createUnauthorizedResponse(
  message: string = 'Unauthorized',
  correlationId: string = 'unknown'
): NextResponse {
  return createErrorResponse(
    message,
    ERROR_CODES.INSUFFICIENT_PERMISSIONS,
    correlationId,
    403
  )
}

/**
 * Extract user context from request for logging
 */
export function getAuthContextForLogging(request: NextRequest) {
  const authContext = getAuthContextFromHeaders(request)
  return {
    userId: authContext.userId,
    userEmail: authContext.userEmail,
    userRole: authContext.userRole,
    correlationId: authContext.correlationId,
  }
}

/**
 * Middleware wrapper for API routes
 * Ensures route is protected and returns auth context
 */
export async function withAuth(
  handler: (request: NextRequest, context: any) => Promise<NextResponse>,
  requiredRoles?: UserRole[]
) {
  return async (request: NextRequest, context: any) => {
    // Verify authentication
    const authResult = verifyAuth(request)
    if (!authResult.authenticated) {
      return authResult.response!
    }

    // Verify role if required
    if (requiredRoles && !hasRole(request, requiredRoles)) {
      const authContext = getAuthContextFromHeaders(request)
      return createUnauthorizedResponse(
        `Insufficient permissions. Required role: ${requiredRoles.join(' or ')}`,
        authContext.correlationId
      )
    }

    // Call handler with authenticated request
    return handler(request, context)
  }
}

/**
 * Type guard for authenticated request
 */
export function isAuthenticated(request: NextRequest): boolean {
  const authContext = getAuthContextFromHeaders(request)
  return authContext.authVerified && !!authContext.userId
}

/**
 * Get all auth information for a request
 */
export function getFullAuthContext(request: NextRequest) {
  const authContext = getAuthContextFromHeaders(request)
  return {
    userId: authContext.userId || '',
    userEmail: authContext.userEmail || '',
    userRole: authContext.userRole,
    isAuthenticated: authContext.authVerified,
    correlationId: authContext.correlationId,
  }
}
