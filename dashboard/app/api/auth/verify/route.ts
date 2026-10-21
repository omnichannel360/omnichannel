import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { createLogger, createLogContext } from '@/lib/logger'

const logger = createLogger('auth-verify-api')

interface VerifyResponse {
  success: boolean
  authenticated: boolean
  user?: {
    email: string
    role: string
    sub: string
  }
  error?: string
}

export async function GET(request: NextRequest): Promise<NextResponse<VerifyResponse>> {
  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    operation: 'verify_auth',
  })

  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'verify')
  if (rateLimitError) {
    logger.warn('Rate limit exceeded for auth verify', {
      ...logContext,
      statusCode: 429,
      responseTimeMs: Date.now() - startTime,
    })
    return rateLimitError as NextResponse<VerifyResponse>
  }

  try {
    const authResult = await verifyAuth(request)

    if (!authResult.authenticated) {
      logger.warn('Token verification failed - authentication required', {
        ...logContext,
        statusCode: 401,
        responseTimeMs: Date.now() - startTime,
        error: authResult.error,
      })
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          error: authResult.error,
        },
        { status: 401 }
      )
    }

    const { payload } = authResult
    logger.info('Token verification successful', {
      ...logContext,
      email: payload!.email,
      role: payload!.role,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    })

    return NextResponse.json(
      {
        success: true,
        authenticated: true,
        user: {
          email: payload!.email,
          role: payload!.role,
          sub: payload!.sub,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token verification failed'
    logger.error('Token verification error - exception during verification', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        error: message,
      },
      { status: 500 }
    )
  }
}
