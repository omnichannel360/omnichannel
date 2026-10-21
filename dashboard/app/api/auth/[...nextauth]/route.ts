/**
 * NextAuth.js Route Handler
 * Handles all authentication endpoints:
 * - POST /api/auth/signin - Sign in user
 * - GET /api/auth/session - Get current session
 * - GET /api/auth/providers - List available providers
 * - POST /api/auth/callback/jwt - JWT callback
 * - GET /api/auth/error - Authentication error page
 * - POST /api/auth/signout - Sign out user
 *
 * Integrates with existing authentication infrastructure
 */

import { NextRequest, NextResponse } from 'next/server'
import { handlers } from '@/auth.config'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'

const { GET: nextAuthGet, POST: nextAuthPost } = handlers

/**
 * Wrap GET handler with rate limiting
 */
export async function GET(request: NextRequest) {
  // Apply rate limiting to NextAuth endpoints
  const rateLimitError = await applyRateLimit(request, 'auth')
  if (rateLimitError) return rateLimitError

  return nextAuthGet(request)
}

/**
 * Wrap POST handler with rate limiting
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting to NextAuth endpoints
  const rateLimitError = await applyRateLimit(request, 'auth')
  if (rateLimitError) return rateLimitError

  return nextAuthPost(request)
}
