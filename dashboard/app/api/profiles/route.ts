import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { logger, createLogContext } from '@/lib/logger'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'

interface AgentProfile {
  name: string
  role: string
  email?: string
  status?: string
}

const PROFILES_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '', '.hermes', 'profiles')

function inferRoleFromName(name: string): string {
  const parts = name.split('-')
  return parts
    .slice(0, -1)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'profiles')
  if (rateLimitError) return rateLimitError

  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    logger.warn('Unauthorized profiles GET attempt', {
      method: request.method,
      path: request.nextUrl.pathname,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,
    operation: 'load_profiles',
  })

  try {
    try {
      await fs.stat(PROFILES_DIR)
    } catch (error) {
      logger.debug('Profiles directory not found, returning empty list', {
        ...logContext,
        error: 'PROFILES_DIR_NOT_FOUND',
      })
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0 },
      })
    }

    const entries = await fs.readdir(PROFILES_DIR, { withFileTypes: true })
    const profiles: AgentProfile[] = entries
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        name: entry.name,
        role: inferRoleFromName(entry.name),
        status: 'active',
      }))

    logger.info('Profiles loaded successfully', {
      ...logContext,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      profileCount: profiles.length,
    })

    return NextResponse.json({
      success: true,
      data: profiles,
      meta: { total: profiles.length },
    })
  } catch (error) {
    logger.error('Failed to load profiles', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json(
      { success: false, error: 'Failed to load profiles' },
      { status: 500 }
    )
  }
}
