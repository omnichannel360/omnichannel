import { NextRequest, NextResponse } from 'next/server'
import { generateToken, generateRefreshToken } from '@/lib/auth'

/**
 * POST /api/auth
 * Generate authentication tokens for API access
 * 
 * @body { userId: string, email: string, role?: string }
 * @returns { accessToken: string, refreshToken: string, expiresIn: number }
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  try {
    const { userId, email, role = 'user' } = body as Record<string, unknown>

    // Validate input
    if (!userId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, email' },
        { status: 400 }
      )
    }

    // Generate tokens
    const accessToken = await generateToken(userId as string, email as string, role as string, 24 * 60 * 60) // 24 hours
    const refreshToken = await generateRefreshToken(userId as string, email as string, 7 * 24 * 60 * 60) // 7 days

    return NextResponse.json({
      accessToken,
      refreshToken,
      expiresIn: 24 * 60 * 60, // 24 hours in seconds
      tokenType: 'Bearer',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate tokens'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
