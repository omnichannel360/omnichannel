import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { withFileLock } from '@/lib/file-lock'
import { logger, createLogContext } from '@/lib/logger'
import { validateBody } from '@/lib/validation/middleware'
import { ProfileUpdateSchema, type ProfileUpdate } from '@/lib/validation/schemas'
import { validateQuery } from '@/lib/validation/middleware'
import { ProfileQuerySchema, type ProfileQuery } from '@/lib/validation/schemas'
import { protectRoute } from '@/lib/protected-route'
import {
  extractCorrelationFromRequest,
  handleRouteError,
  createSuccessResponse,
} from '@/lib/error-handling'

interface AgentProfile {
  name: string
  role: string
  email?: string
  status?: string
}

/**
 * Get the profiles directory path.
 * Validates that HOME or USERPROFILE environment variable is set.
 * @throws {Error} If neither HOME nor USERPROFILE is configured
 */
function getProfilesDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE

  if (!homeDir) {
    throw new Error(
      'PROFILES_DIR configuration error: HOME or USERPROFILE environment variable not set. ' +
      'Cannot locate .hermes/profiles directory. ' +
      'Please configure HOME or USERPROFILE in your environment.'
    )
  }

  return path.join(homeDir, '.hermes', 'profiles')
}

// Validate profiles directory at module load time
let PROFILES_DIR: string
try {
  PROFILES_DIR = getProfilesDir()
} catch (error) {
  logger.error('Failed to initialize profiles directory', error, {
    operation: 'profiles_init',
    message: error instanceof Error ? error.message : String(error),
  })
  // Use fallback for development
  PROFILES_DIR = path.join(process.cwd(), 'config', 'profiles')
}

function inferRoleFromName(name: string): string {
  const parts = name.split('-')
  return parts
    .slice(0, -1)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

export const GET = protectRoute(
  async (request: NextRequest, { userId }) => {
    const requestId = extractCorrelationFromRequest(request.headers)

    const startTime = Date.now()
    const logContext = createLogContext({
      method: request.method,
      path: request.nextUrl.pathname,
      userId,
      operation: 'load_profiles',
      requestId,
    })

    // Validate query parameters
    const queryResult = await validateQuery<ProfileQuery>(request, ProfileQuerySchema)
    if (!queryResult.success) {
      return queryResult.response
    }

    try {
      const profiles = await withFileLock(PROFILES_DIR, async () => {
        try {
          await fs.stat(PROFILES_DIR)
        } catch (error) {
          logger.debug('Profiles directory not found, returning empty list', {
            ...logContext,
            error: 'PROFILES_DIR_NOT_FOUND',
          })
          return []
        }

        const entries = await fs.readdir(PROFILES_DIR, { withFileTypes: true })
        return entries
          .filter(entry => entry.isDirectory())
          .map(entry => ({
            name: entry.name,
            role: inferRoleFromName(entry.name),
            status: 'active',
          }))
      })

      logger.info('Profiles loaded successfully', {
        ...logContext,
        statusCode: 200,
        responseTimeMs: Date.now() - startTime,
        profileCount: profiles.length,
      })

      const response = NextResponse.json(createSuccessResponse(profiles, requestId))
      response.headers.set('x-correlation-id', requestId)
      return response
    } catch (error) {
      const responseTime = Date.now() - startTime
      const { response, statusCode } = handleRouteError(error, requestId, {
        method: request.method,
        path: request.nextUrl.pathname,
        userId,
        operation: 'load_profiles',
      })
      logger.error('Failed to load profiles', error, {
        ...logContext,
        statusCode,
        responseTimeMs: responseTime,
      })
      response.headers.set('x-correlation-id', requestId)
      return response
    }
  },
  { requireAuth: true, rateLimitKey: 'profiles' }
)
