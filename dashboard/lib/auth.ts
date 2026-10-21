import { NextRequest } from 'next/server'
import jwt, { JwtPayload } from 'jsonwebtoken'

export type UserRole = 'admin' | 'user' | 'viewer'

// CRITICAL: JWT_SECRET must be set in environment - do not use fallback in production
const getJWTSecret = (): string => {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is not set. ' +
      'This is required for authentication to function securely.'
    )
  }
  return secret
}

export interface TokenPayload extends JwtPayload {
  sub: string
  email: string
  role: UserRole
  iat: number
  exp: number
}

/**
 * Role-based permission definitions
 */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
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

/**
 * Verify JWT token from request headers
 * Returns null if token is invalid or missing
 */
export async function verifyToken(request: NextRequest): Promise<TokenPayload | null> {
  try {
    const authHeader = request.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, getJWTSecret()) as JwtPayload

    // Validate decoded token has required fields before returning
    if (!isValidTokenPayload(decoded)) {
      return null
    }

    return decoded as TokenPayload
  } catch (error) {
    return null
  }
}

/**
 * Helper for verifying auth in API routes (backwards compatible)
 */
export async function verifyAuth(request: NextRequest): Promise<{ authenticated: boolean; error?: string; payload?: TokenPayload }> {
  const token = await verifyToken(request)
  if (!token) {
    return { authenticated: false, error: 'Missing or invalid authentication token' }
  }
  return { authenticated: true, payload: token }
}

/**
 * Create unauthorized response (backwards compatible)
 */
export function createUnauthorizedResponse(error: string): Response {
  return new Response(JSON.stringify({ error, success: false }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Generate JWT token
 */
export async function generateToken(
  userId: string,
  email: string,
  role: UserRole = 'user',
  expiresIn: number = 24 * 60 * 60 // 24 hours default
): Promise<string> {
  // Type-safe validation: role must be one of the defined UserRole values
  if (!['admin', 'user', 'viewer'].includes(role)) {
    throw new Error(`Invalid role: "${role}". Must be one of: admin, user, viewer`)
  }

  const token = jwt.sign(
    {
      sub: userId,
      email,
      role,
    },
    getJWTSecret(),
    { expiresIn }
  )

  return token
}

/**
 * Generate refresh token with longer expiration
 */
export async function generateRefreshToken(
  userId: string,
  email: string,
  expiresIn: number = 7 * 24 * 60 * 60 // 7 days default
): Promise<string> {
  const token = jwt.sign(
    {
      sub: userId,
      email,
      type: 'refresh',
    },
    getJWTSecret(),
    { expiresIn }
  )

  return token
}

/**
 * Authentication error responses
 */
export const AuthErrors = {
  MISSING_TOKEN: { status: 401, message: 'Missing authentication token' },
  INVALID_TOKEN: { status: 401, message: 'Invalid or expired token' },
  FORBIDDEN: { status: 403, message: 'Insufficient permissions' },
  UNAUTHORIZED: { status: 401, message: 'Unauthorized request' },
} as const

/**
 * Check if user has specific permission
 */
export function hasPermission(role: UserRole, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role]
  return permissions.includes(permission)
}

/**
 * Check if user has all required permissions
 */
export function hasAllPermissions(role: UserRole, permissions: string[]): boolean {
  return permissions.every(permission => hasPermission(role, permission))
}

/**
 * Check if user has any of the required permissions
 */
export function hasAnyPermission(role: UserRole, permissions: string[]): boolean {
  return permissions.some(permission => hasPermission(role, permission))
}

/**
 * Check if user has required role
 */
export function hasRequiredRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.includes(userRole)
}

/**
 * Get permissions for a role
 */
export function getRolePermissions(role: UserRole): string[] {
  return ROLE_PERMISSIONS[role] || []
}

/**
 * Validate token payload has required fields
 */
export function isValidTokenPayload(payload: unknown): payload is TokenPayload {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  return (
    typeof p.sub === 'string' &&
    typeof p.email === 'string' &&
    (p.role === 'admin' || p.role === 'user' || p.role === 'viewer') &&
    typeof p.iat === 'number' &&
    typeof p.exp === 'number'
  )
}
