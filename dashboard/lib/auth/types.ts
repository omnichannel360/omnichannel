import { NextRequest } from 'next/server'

export interface AuthToken {
  sub: string
  email: string
  role: 'admin' | 'user' | 'viewer'
  iat: number
  exp: number
}

export interface AuthContext {
  userId: string
  email: string
  role: 'admin' | 'user' | 'viewer'
  token: string
}

export interface AuthenticatedRequest extends NextRequest {
  auth?: AuthContext
}

export interface AuthResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  meta?: Record<string, unknown>
}

export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message)
    this.name = 'AuthError'
  }
}
