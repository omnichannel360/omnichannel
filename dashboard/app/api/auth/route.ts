import { NextRequest, NextResponse } from 'next/server'
import { generateToken, generateRefreshToken } from '@/lib/auth'
import { createRateLimitMiddleware, addRateLimitHeaders, RATE_LIMIT_CONFIGS } from '@/lib/rateLimit/middleware'
import { logger, createLogContext } from '@/lib/logger'

// Create rate limiter for this endpoint
const rateLimitMiddleware = createRateLimitMiddleware(RATE_LIMIT_CONFIGS.auth)

/**
 * POST /api/auth
 * Generate authentication tokens for API access
 *
 * @body { userId: string, email: string, role?: string }
 * @returns { accessToken: string, refreshToken: string, expiresIn: number }
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitCheck = await rateLimitMiddleware(request)
  if (!rateLimitCheck.allowed) {
    return rateLimitCheck.response!
  }

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    operation: 'auth_token_generation',
  })

  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    logger.error('Failed to parse auth request body', error, {
      ...logContext,
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  try {
    const { userId, email, role = 'user' } = body as Record<string, unknown>

    // Validate input
    if (!userId || !email) {
      logger.warn('Auth request missing required fields', {
        ...logContext,
        statusCode: 400,
        missingFields: {
          userId: !userId,
          email: !email,
        },
      })
      return NextResponse.json(
        { error: 'Missing required fields: userId, email' },
        { status: 400 }
      )
    }

    // Generate tokens
    const accessToken = await generateToken(userId as string, email as string, role as string, 24 * 60 * 60) // 24 hours
    const refreshToken = await generateRefreshToken(userId as string, email as string, 7 * 24 * 60 * 60) // 7 days

    logger.info('Auth tokens generated successfully', {
      ...logContext,
      userEmail: email,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    })

    let response = NextResponse.json({
      accessToken,
      refreshToken,
      expiresIn: 24 * 60 * 60, // 24 hours in seconds
      tokenType: 'Bearer',
    })

    // Add rate limit headers to successful response
    response = addRateLimitHeaders(
      response,
      rateLimitCheck.remaining!,
      rateLimitCheck.resetTime!,
      rateLimitCheck.limit!
    )

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate tokens'
    logger.error('Auth token generation failed', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })

    const response = NextResponse.json(
      { error: message },
      { status: 500 }
    )

    // Add rate limit headers even on error
    return addRateLimitHeaders(
      response,
      rateLimitCheck.remaining!,
      rateLimitCheck.resetTime!,
      rateLimitCheck.limit!
    )
  }
}
