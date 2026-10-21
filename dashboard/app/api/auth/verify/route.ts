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

  // SECURITY: Enforce HTTPS in production
  if (process.env.NODE_ENV === 'production' && request.nextUrl.protocol !== 'https:') {
    logger.warn('Non-HTTPS request rejected in production', {
      ...logContext,
      protocol: request.nextUrl.protocol,
      statusCode: 400,
    })
    return NextResponse.json(
      { success: false, authenticated: false, error: 'HTTPS required' },
      { status: 400 }
    )
  }

  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'verify')
  if (rateLimitError) {
    logger.warn('Rate limit exceeded for auth verify', {
      ...logContext,
      statusCode: 429,
      responseTimeMs: Date.now() - startTime,
    })
    if (rateLimitError instanceof NextResponse) {
      return rateLimitError as NextResponse<VerifyResponse>
    }
    return NextResponse.json({ success: false, authenticated: false, error: 'Rate limit exceeded' }, { status: 429 })
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

    // Type guard: authResult.authenticated is true, so payload is guaranteed to exist
    // If payload is somehow missing, this is a contract violation in verifyAuth
    if (!payload) {
      const err = new Error('Contract violation: Token payload missing after authentication verification')
      logger.error('Auth verification contract violation', err, {
        ...logContext,
        statusCode: 500,
      })
      throw err
    }

    logger.info('Token verification successful', {
      ...logContext,
      email: payload.email,
      role: payload.role,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    })

    const response = NextResponse.json(
      {
        success: true,
        authenticated: true,
        user: {
          email: payload.email,
          role: payload.role,
          sub: payload.sub,
        },
      },
      { status: 200 }
    )

    // SECURITY: Add security headers
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

    return response
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
