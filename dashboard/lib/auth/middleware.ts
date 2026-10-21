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
 * Verify JWT token from request
 * @param request NextRequest object
 * @returns Promise<JWTPayload | null> Decoded payload or null if invalid
 */
export async function verifyAuth(request: NextRequest): Promise<JWTPayload | null> {
  try {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader) {
      return null
    }

    const token = extractToken(authHeader)
    if (!token) {
      return null
    }

    const payload = await verifyToken(token)
    return payload
  } catch (error) {
    // Log the error for audit purposes (implement with your logger)
    return null
  }
}

/**
 * Authentication middleware - validates JWT token
 * Attach this to protected routes
 */
export async function withAuth(
  request: NextRequest,
  handler: (request: NextRequest, user: JWTPayload) => Promise<Response>
): Promise<Response> {
  try {
    // Check if endpoint is public
    const pathname = new URL(request.url).pathname
    if (isPublicEndpoint(pathname)) {
      return await handler(request, {} as JWTPayload)
    }

    // Verify authentication
    const user = await verifyAuth(request)
    
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized - Invalid or missing authentication token'
        },
        { status: 401 }
      )
    }

    // Call handler with authenticated user
    return await handler(request, user)
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Authentication error'
      },
      { status: 500 }
    )
  }
}

/**
 * Create an authenticated route handler
 * Usage: export const GET = createAuthRoute(getHandler)
 */
export function createAuthRoute(
  handler: (request: NextRequest, user: JWTPayload) => Promise<Response>
) {
  return async (request: NextRequest) => {
    return withAuth(request, handler)
  }
}

/**
 * Helper to create unauthorized response
 * @param message Error message
 * @returns NextResponse with 401 status
 */
export function createUnauthorizedResponse(message: string): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 401 }
  )
}
