import { NextRequest } from 'next/server'
import jwt, { JwtPayload } from 'jsonwebtoken'

export type UserRole = 'admin' | 'user' | 'viewer'

// SECURITY: Extract valid roles as constant to prevent duplication and maintenance bugs
export const VALID_ROLES: readonly UserRole[] = ['admin', 'user', 'viewer']

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

    // RFC 7235 §2.1: auth-scheme is case-insensitive; exactly one token must follow
    const match = authHeader?.match(/^Bearer\s+(\S+)$/i)
    if (!match) {
      return null
    }

    const token = match[1]
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
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(', ')}`)
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
 * FIXED: Added explicit null/undefined checks and timestamp validation
 */
export function isValidTokenPayload(payload: unknown): payload is TokenPayload {
  if (!payload || typeof payload !== 'object') return false

  const p = payload as Record<string, unknown>

  // Validate all required fields exist and have correct types
  if (typeof p.sub !== 'string' || p.sub.length === 0) return false
  if (typeof p.email !== 'string' || p.email.length === 0) return false
  if (typeof p.iat !== 'number' || p.iat <= 0) return false
  if (typeof p.exp !== 'number' || p.exp <= 0) return false

  // Validate role is one of the allowed values - type-safe check
  if (typeof p.role !== 'string') return false
  if (!VALID_ROLES.includes(p.role as UserRole)) return false

  // Validate token is not expired
  const now = Math.floor(Date.now() / 1000)
  if (p.exp <= now) return false

  // Validate iat is in the past
  if (p.iat > now) return false

  // Validate iat is before exp
  if (p.iat >= p.exp) return false

  return true
}
