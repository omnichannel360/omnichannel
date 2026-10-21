import { NextRequest, NextResponse } from 'next/server'
import { generateToken } from '@/lib/auth'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { createLogger, createLogContext } from '@/lib/logger'
import { validateBody } from '@/lib/validation/middleware'
import { LoginRequestSchema, type LoginRequest } from '@/lib/validation/schemas'

const logger = createLogger('auth-login-api')

interface LoginResponse {
  success: boolean
  token?: string
  error?: string
  user?: {
    email: string
    role: string
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<LoginResponse>> {
  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    operation: 'login',
  })

  // Apply rate limiting first
  const rateLimitError = await applyRateLimit(request, 'login')
  if (rateLimitError) {
    logger.warn('Rate limit exceeded for login', {
      ...logContext,
      statusCode: 429,
      responseTimeMs: Date.now() - startTime,
    })
    return rateLimitError as NextResponse<LoginResponse>
  }

  try {
    // Validate request body with Zod schema
    const bodyResult = await validateBody<LoginRequest>(request, LoginRequestSchema)
    if (!bodyResult.success) {
      return bodyResult.response
    }

    const { email, password } = bodyResult.data

    // TODO: Replace with actual user database lookup
    // This is a placeholder implementation for development
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
    const adminPassword = process.env.ADMIN_PASSWORD || 'change-this-in-production'

    // Validate credentials
    if (email !== adminEmail || password !== adminPassword) {
      logger.warn('Login failed - invalid credentials', {
        ...logContext,
        email,
        statusCode: 401,
        responseTimeMs: Date.now() - startTime,
      })
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email or password',
        },
        { status: 401 }
      )
    }

    // Create JWT token
    const token = await generateToken(email, email, 'admin')

    logger.info('Login successful', {
      ...logContext,
      email,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    })

    return NextResponse.json(
      {
        success: true,
        token,
        user: {
          email,
          role: 'admin',
        },
      },
      { status: 200 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed'
    logger.error('Login error - exception during authentication', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    )
  }
}
