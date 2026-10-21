import { NextRequest } from 'next/server'
import jwt, { JwtPayload } from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production'

export interface TokenPayload extends JwtPayload {
  sub: string
  email: string
  role: string
  iat: number
  exp: number
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
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload
    
    return decoded
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
  role: string = 'user',
  expiresIn: number = 24 * 60 * 60 // 24 hours default
): Promise<string> {
  const token = jwt.sign(
    {
      sub: userId,
      email,
      role,
    },
    JWT_SECRET,
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
    JWT_SECRET,
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
