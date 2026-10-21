import { NextRequest, NextResponse } from 'next/server'
import { generateToken } from '@/lib/auth'

interface LoginRequest {
  email: string
  password: string
}

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
  try {
    const body: LoginRequest = await request.json()
    const { email, password } = body

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email and password are required',
        },
        { status: 400 }
      )
    }

    // TODO: Replace with actual user database lookup
    // This is a placeholder implementation for development
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
    const adminPassword = process.env.ADMIN_PASSWORD || 'change-this-in-production'

    // Validate credentials
    if (email !== adminEmail || password !== adminPassword) {
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
    console.error('Login error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Authentication failed',
      },
      { status: 500 }
    )
  }
}
