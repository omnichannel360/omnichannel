import { NextRequest, NextResponse } from 'next/server'
import { generateToken, generateRefreshToken, verifyToken } from '@/lib/auth'
import { createRateLimitMiddleware, addRateLimitHeaders, RATE_LIMIT_CONFIGS } from '@/lib/rateLimit/middleware'
import { logger, createLogContext } from '@/lib/logger'
import { validateBody } from '@/lib/validation/middleware'
import { TokenGenerationSchema, type TokenGeneration } from '@/lib/validation/schemas'
import {
  extractCorrelationFromRequest,
  handleRouteError,
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
} from '@/lib/error-handling'

// Create rate limiter for this endpoint
const rateLimitMiddleware = createRateLimitMiddleware(RATE_LIMIT_CONFIGS.auth)

/**
 * POST /api/auth
 * Generate authentication tokens for API access (admin only — e.g. service tokens).
 * Interactive users obtain tokens via /api/auth/login.
 *
 * @header Authorization: Bearer <admin access token>
 * @body { userId: string, email: string, role?: string }
 * @returns { accessToken: string, refreshToken: string, expiresIn: number }
 */
export async function POST(request: NextRequest) {
  const requestId = extractCorrelationFromRequest(request.headers)

  // Apply rate limiting
  const rateLimitCheck = await rateLimitMiddleware(request)
  if (!rateLimitCheck.allowed) {
    return rateLimitCheck.response!
  }

  // Ensure rate limit values exist after allowed check
  const remaining = rateLimitCheck.remaining ?? 0
  const resetTime = rateLimitCheck.resetTime ?? (Date.now() + 3600 * 1000)
  const limit = rateLimitCheck.limit ?? RATE_LIMIT_CONFIGS.auth.maxRequests

  // Middleware treats /api/auth* as public, so the caller must be authorized here
  const caller = await verifyToken(request)
  if (!caller) {
    return addRateLimitHeaders(
      createErrorResponse('Authentication required', ERROR_CODES.AUTH_MISSING, requestId, 401),
      remaining,
      resetTime,
      limit
    )
  }
  if (caller.role !== 'admin') {
    return addRateLimitHeaders(
      createErrorResponse(
        'Insufficient permissions. Required role: admin',
        ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        requestId,
        403
      ),
      remaining,
      resetTime,
      limit
    )
  }

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    operation: 'auth_token_generation',
    requestId,
  })

  try {
    // Validate request body with Zod schema
    const bodyResult = await validateBody<TokenGeneration>(request, TokenGenerationSchema)
    if (!bodyResult.success) {
      return bodyResult.response
    }

    const { userId, email, role } = bodyResult.data

    // Generate tokens
    const accessToken = await generateToken(userId, email, role, 24 * 60 * 60) // 24 hours
    const refreshToken = await generateRefreshToken(userId, email, 7 * 24 * 60 * 60) // 7 days

    logger.info('Auth tokens generated successfully', {
      ...logContext,
      issuedBy: caller.sub,
      userEmail: email,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    })

    const successData = createSuccessResponse(
      {
        accessToken,
        refreshToken,
        expiresIn: 24 * 60 * 60, // 24 hours in seconds
        tokenType: 'Bearer',
      },
      requestId
    )

    let response = NextResponse.json(successData)
    response.headers.set('x-correlation-id', requestId)

    // Add rate limit headers to successful response
    response = addRateLimitHeaders(
      response,
      remaining,
      resetTime,
      limit
    )

    return response
  } catch (error) {
    const responseTime = Date.now() - startTime
    const { response, statusCode } = handleRouteError(error, requestId, {
      method: request.method,
      path: request.nextUrl.pathname,
      operation: 'auth_token_generation',
    })

    logger.error('Auth token generation failed', error, {
      ...logContext,
      statusCode,
      responseTimeMs: responseTime,
    })

    // Add rate limit headers even on error
    return addRateLimitHeaders(
      response,
      remaining,
      resetTime,
      limit
    )
  }
}
