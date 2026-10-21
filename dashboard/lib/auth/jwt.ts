import { jwtVerify, SignJWT } from 'jose'

// JWT token types
export interface JWTPayload {
  userId: string
  email: string
  role: 'admin' | 'user'
  iat: number
  exp: number
}

// Secret key from environment - must be set in production
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-key-change-in-production'
)

// Token expiry times
const TOKEN_EXPIRY = 24 * 60 * 60 // 24 hours in seconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 // 7 days in seconds

/**
 * Sign a JWT token with user data
 * @param payload User payload to encode
 * @returns Promise<string> Signed JWT token
 */
export async function signToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>
): Promise<string> {
  try {
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(JWT_SECRET)

    return token
  } catch (error) {
    throw new Error(`Failed to sign token: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Verify and decode a JWT token
 * @param token JWT token to verify
 * @returns Promise<JWTPayload> Decoded token payload
 */
export async function verifyToken(token: string): Promise<JWTPayload> {
  try {
    const verified = await jwtVerify(token, JWT_SECRET)
    return verified.payload as JWTPayload
  } catch (error) {
    throw new Error(`Invalid token: ${error instanceof Error ? error.message : 'Token verification failed'}`)
  }
}

/**
 * Extract JWT token from Authorization header
 * @param authHeader Authorization header value
 * @returns Token string or null if invalid format
 */
export function extractToken(authHeader: string | null): string | null {
  if (!authHeader) return null

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null
  }

  return parts[1]
}

/**
 * Check if token is expired
 * @param payload JWT payload
 * @returns boolean True if expired
 */
export function isTokenExpired(payload: JWTPayload): boolean {
  return Math.floor(Date.now() / 1000) > payload.exp
}
