import jwt from 'jsonwebtoken'
import { AuthToken, AuthError, AuthContext } from './types'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export function verifyToken(token: string): AuthToken {
  try {
    if (!token) {
      throw new AuthError('No token provided', 'NO_TOKEN', 401)
    }

    const decoded = jwt.verify(token, JWT_SECRET) as AuthToken

    if (!decoded.sub || !decoded.email) {
      throw new AuthError('Invalid token structure', 'INVALID_TOKEN', 401)
    }

    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      throw new AuthError('Token has expired', 'TOKEN_EXPIRED', 401)
    }

    return decoded
  } catch (error) {
    if (error instanceof AuthError) throw error
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthError('Token has expired', 'TOKEN_EXPIRED', 401)
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthError('Invalid token', 'INVALID_TOKEN', 401)
    }
    throw new AuthError('Token verification failed', 'VERIFICATION_FAILED', 401)
  }
}

export function extractBearerToken(authHeader?: string): string {
  if (!authHeader) {
    throw new AuthError('Missing Authorization header', 'MISSING_HEADER', 401)
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AuthError('Invalid Authorization header format', 'INVALID_HEADER', 401)
  }

  return parts[1]
}

export function authenticateRequest(authHeader?: string): AuthContext {
  try {
    const token = extractBearerToken(authHeader)
    const decoded = verifyToken(token)

    return {
      userId: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      token,
    }
  } catch (error) {
    if (error instanceof AuthError) throw error
    throw new AuthError('Authentication failed', 'AUTH_FAILED', 401)
  }
}

export function isAuthorized(
  requiredRole: 'admin' | 'user' | 'viewer',
  userRole: string
): boolean {
  const roleHierarchy: Record<string, number> = {
    admin: 3,
    user: 2,
    viewer: 1,
  }

  const userRoleLevel = roleHierarchy[userRole] || 0
  const requiredLevel = roleHierarchy[requiredRole] || 0

  return userRoleLevel >= requiredLevel
}

export function createToken(
  userId: string,
  email: string,
  role: 'admin' | 'user' | 'viewer' = 'user',
  expiresIn: string = '24h'
): string {
  return jwt.sign(
    {
      sub: userId,
      email,
      role,
    },
    JWT_SECRET,
    {
      expiresIn,
      issuer: 'omniforge-dashboard',
      audience: 'omniforge-dashboard-api',
    }
  )
}
