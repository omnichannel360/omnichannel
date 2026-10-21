import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
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

  // SECURITY: Enforce HTTPS in production
  if (process.env.NODE_ENV === 'production' && request.nextUrl.protocol !== 'https:') {
    logger.warn('Non-HTTPS request rejected in production', {
      ...logContext,
      protocol: request.nextUrl.protocol,
      statusCode: 400,
    })
    return NextResponse.json(
      { success: false, error: 'HTTPS required' },
      { status: 400 }
    )
  }

  // SECURITY: Validate content-type header
  const contentType = request.headers.get('content-type')
  if (!contentType?.includes('application/json')) {
    logger.warn('Invalid content-type for login request', {
      ...logContext,
      contentType: contentType || 'missing',
      statusCode: 400,
    })
    return NextResponse.json(
      { success: false, error: 'Content-Type must be application/json' },
      { status: 400 }
    )
  }

  // Apply rate limiting first
  const rateLimitError = await applyRateLimit(request, 'login')
  if (rateLimitError) {
    logger.warn('Rate limit exceeded for login', {
      ...logContext,
      statusCode: 429,
      responseTimeMs: Date.now() - startTime,
    })
    // Ensure response matches LoginResponse interface
    if (rateLimitError instanceof NextResponse) {
      return rateLimitError as NextResponse<LoginResponse>
    }
    return NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 })
  }

  try {
    // Validate request body with Zod schema
    const bodyResult = await validateBody<LoginRequest>(request, LoginRequestSchema)
    if (!bodyResult.success) {
      return bodyResult.response
    }

    const { email, password } = bodyResult.data

    // Validate required environment variables
    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminEmail || !adminPassword) {
      logger.error('Missing required authentication configuration', new Error('ADMIN_EMAIL or ADMIN_PASSWORD not set'), {
        ...logContext,
        hasAdminEmail: !!adminEmail,
        hasAdminPassword: !!adminPassword,
      })
      return NextResponse.json(
        {
          success: false,
          error: 'Server configuration error',
        },
        { status: 500 }
      )
    }

    // Validate credentials using constant-time comparison to prevent timing attacks
    const emailMatch = email === adminEmail
    const passwordBuffer = Buffer.from(password || '')
    const adminPasswordBuffer = Buffer.from(adminPassword)

    // Only perform timing-safe comparison if lengths match (prevents early exit on length mismatch)
    let passwordMatch = false
    if (passwordBuffer.length === adminPasswordBuffer.length) {
      try {
        passwordMatch = timingSafeEqual(passwordBuffer, adminPasswordBuffer)
      } catch {
        // timingSafeEqual throws if buffers have different lengths; set to false
        passwordMatch = false
      }
    }

    if (!emailMatch || !passwordMatch) {
      logger.warn('Login failed - authentication rejected', {
        ...logContext,
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

    const response = NextResponse.json(
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

    // SECURITY: Add security headers
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

    return response
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
