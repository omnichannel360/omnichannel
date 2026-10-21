import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'

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
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.authenticated) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          error: authResult.error,
        },
        { status: authResult.status }
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
    console.error('Token verification error:', error)
    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        error: 'Token verification failed',
      },
      { status: 500 }
    )
  }
}
