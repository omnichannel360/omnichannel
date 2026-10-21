import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken, JWTPayload } from './jwt'

// Public endpoints that don't require authentication
export const PUBLIC_ENDPOINTS = [
  '/api/health',
  '/api/health/status',
]

/**
 * Check if an endpoint is public (doesn't require auth)
 */
export function isPublicEndpoint(pathname: string): boolean {
  return PUBLIC_ENDPOINTS.some(endpoint => pathname.startsWith(endpoint))
}

/**
 * Auth result type
 */
export interface AuthResult {
  authenticated: boolean
  user?: JWTPayload
  error?: string
}

/**
 * Verify JWT token from request and return auth status
 * @param request NextRequest object
 * @returns AuthResult with authentication status
 */
export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  try {
    const pathname = new URL(request.url).pathname
    
    // Allow public endpoints without authentication
    if (isPublicEndpoint(pathname)) {
      return { authenticated: true }
    }

    const authHeader = request.headers.get('authorization')
    
    if (!authHeader) {
      return { authenticated: false, error: 'Missing authorization header' }
    }

    const token = extractToken(authHeader)
    if (!token) {
      return { authenticated: false, error: 'Invalid authorization header format' }
    }

    const payload = await verifyToken(token)
    return { authenticated: true, user: payload }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed'
    return { authenticated: false, error: message }
  }
}

/**
 * Create an unauthorized response
 * @param message Error message
 * @returns NextResponse with 401 status
 */
export function createUnauthorizedResponse(message: string = 'Unauthorized'): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message
    },
    { status: 401 }
  )
}

/**
 * Create a forbidden response
 * @param message Error message
 * @returns NextResponse with 403 status
 */
export function createForbiddenResponse(message: string = 'Forbidden'): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message
    },
    { status: 403 }
  )
}

/**
 * Create an error response
 * @param message Error message
 * @param status HTTP status code
 * @returns NextResponse with specified status
 */
export function createErrorResponse(message: string, status: number = 500): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message
    },
    { status }
  )
}

export * from './jwt'
export * from './middleware'
