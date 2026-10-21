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
  try {
    const { userId, email, role = 'user' } = await request.json()

    // Validate input
    if (!userId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, email' },
        { status: 400 }
      )
    }

    // Generate tokens
    const accessToken = await generateToken(userId, email, role, 24 * 60 * 60) // 24 hours
    const refreshToken = await generateRefreshToken(userId, email, 7 * 24 * 60 * 60) // 7 days

    return NextResponse.json({
      accessToken,
      refreshToken,
      expiresIn: 24 * 60 * 60, // 24 hours in seconds
      tokenType: 'Bearer',
    })
  } catch (error) {
    console.error('[Auth Endpoint Error]', error)
    return NextResponse.json(
      { error: 'Failed to generate tokens' },
      { status: 500 }
    )
  }
}
