import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'

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
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'verify')
  if (rateLimitError) {
    return rateLimitError as NextResponse<VerifyResponse>
  }

  try {
    const authResult = await verifyAuth(request)

    if (!authResult.authenticated) {
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
