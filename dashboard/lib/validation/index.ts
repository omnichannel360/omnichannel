/**
 * Unified Input Validation System
 * Central hub for all API input validation across OmniChannel
 *
 * Features:
 * - Zod-based schema validation
 * - Type-safe error responses
 * - Comprehensive logging
 * - Security sanitization
 * - Consistent error format
 */

import { NextRequest, NextResponse } from 'next/server'
import { ZodSchema, ZodError, z } from 'zod'
import path from 'path'
import { createLogger } from '@/lib/logger'
// Re-export complete sanitizeString from input-validation (includes HTML entity escaping for XSS protection)
import { sanitizeString as completeSanitizeString } from '@/lib/input-validation'
// FIXED: Import at top-level to avoid runtime require() and potential circular dependency
import { generateUUIDv4 } from '@/lib/uuid'

const logger = createLogger('validation-system')

/**
 * Standard validation error format
 */
export interface ValidationError {
  field: string
  message: string
  code?: string
}

export interface ValidationErrorResponse {
  success: false
  error: string
  validationErrors?: ValidationError[]
  timestamp: string
}

export interface SuccessResponse<T> {
  success: true
  data: T
  timestamp: string
}

/**
 * Parse Zod errors into user-friendly format
 */
export function formatZodErrors(error: ZodError): ValidationError[] {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }))
}

/**
 * Validate request body against a Zod schema
 *
 * @param request - Next.js request object
 * @param schema - Zod schema for validation
 * @returns Validation result with data or error response
 *
 * @example
 * const result = await validateBody(request, LoginRequestSchema)
 * if (!result.success) {
 *   return result.response
 * }
 * const { email, password } = result.data
 */
export async function validateBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): Promise<
  | { success: true; data: T }
  | { success: false; response: NextResponse<ValidationErrorResponse> }
> {
  try {
    const body = await request.json()

    try {
      const validatedData = schema.parse(body)
      return {
        success: true,
        data: validatedData,
      }
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = formatZodErrors(error)

        logger.warn('Request body validation failed', {
          path: request.nextUrl.pathname,
          method: request.method,
          errors: validationErrors,
        })

        return {
          success: false,
          response: NextResponse.json(
            {
              success: false,
              error: 'Request validation failed',
              validationErrors,
              timestamp: new Date().toISOString(),
            } as ValidationErrorResponse,
            { status: 400 }
          ),
        }
      }

      throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse request body'

    logger.error('Request body parsing failed', error, {
      path: request.nextUrl.pathname,
      method: request.method,
      message,
    })

    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Invalid request format',
          timestamp: new Date().toISOString(),
        } as ValidationErrorResponse,
        { status: 400 }
      ),
    }
  }
}

/**
 * Validate query parameters against a Zod schema
 *
 * @param request - Next.js request object
 * @param schema - Zod schema for validation
 * @returns Validation result with data or error response
 *
 * @example
 * const result = await validateQuery(request, BrainQuerySchema)
 * if (!result.success) {
 *   return result.response
 * }
 * const { category, limit } = result.data
 */
export async function validateQuery<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): Promise<
  | { success: true; data: T }
  | { success: false; response: NextResponse<ValidationErrorResponse> }
> {
  try {
    const { searchParams } = new URL(request.url)
    const queryObject: Record<string, unknown> = {}

    // Convert URLSearchParams to object
    searchParams.forEach((value, key) => {
      // Try to parse as number if it looks like one
      if (!isNaN(Number(value)) && value !== '') {
        queryObject[key] = Number(value)
      } else if (value.toLowerCase() === 'true') {
        queryObject[key] = true
      } else if (value.toLowerCase() === 'false') {
        queryObject[key] = false
      } else {
        queryObject[key] = value
      }
    })

    try {
      const validatedData = schema.parse(queryObject)
      return {
        success: true,
        data: validatedData,
      }
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = formatZodErrors(error)

        logger.warn('Query validation failed', {
          path: request.nextUrl.pathname,
          method: request.method,
          query: queryObject,
          errors: validationErrors,
        })

        return {
          success: false,
          response: NextResponse.json(
            {
              success: false,
              error: 'Query validation failed',
              validationErrors,
              timestamp: new Date().toISOString(),
            } as ValidationErrorResponse,
            { status: 400 }
          ),
        }
      }

      throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse query parameters'

    logger.error('Query parsing failed', error, {
      path: request.nextUrl.pathname,
      method: request.method,
      message,
    })

    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          timestamp: new Date().toISOString(),
        } as ValidationErrorResponse,
        { status: 400 }
      ),
    }
  }
}

/**
 * Validate both body and query parameters simultaneously
 *
 * @param request - Next.js request object
 * @param bodySchema - Zod schema for request body
 * @param querySchema - Zod schema for query parameters
 * @returns Combined validation result
 */
export async function validateBodyAndQuery<T, Q>(
  request: NextRequest,
  bodySchema: ZodSchema<T>,
  querySchema: ZodSchema<Q>
): Promise<
  | { success: true; data: T; query: Q }
  | { success: false; response: NextResponse<ValidationErrorResponse> }
> {
  // Validate query first (faster, no parsing needed)
  const queryResult = await validateQuery(request, querySchema)
  if (!queryResult.success) {
    return queryResult
  }

  // Then validate body
  const bodyResult = await validateBody(request, bodySchema)
  if (!bodyResult.success) {
    return bodyResult
  }

  return {
    success: true,
    data: bodyResult.data,
    query: queryResult.data,
  }
}

/**
 * Create standardized validation error response
 *
 * @param errors - Array of validation errors
 * @returns NextResponse with proper error format
 */
export function createValidationErrorResponse(
  errors: ValidationError[]
): NextResponse<ValidationErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: 'Validation failed',
      validationErrors: errors,
      timestamp: new Date().toISOString(),
    },
    { status: 400 }
  )
}

/**
 * Create standardized success response
 *
 * @param data - Response data
 * @param status - HTTP status code (default: 200)
 * @returns NextResponse with success data
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200
): NextResponse<SuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    },
    { status }
  )
}

/**
 * Input Sanitization Utilities
 */

/**
 * Removes injection attack patterns from strings - COMPLETE VERSION with XSS protection
 *
 * Performs TWO security operations:
 * 1. Removes null bytes and control characters
 * 2. Escapes HTML entities to prevent XSS attacks
 *
 * This delegates to the authoritative implementation in input-validation.ts.
 * Always use this function, never the incomplete version.
 *
 * @param input - String to sanitize
 * @returns Sanitized string safe for HTML context
 */
export function sanitizeString(input: string): string {
  // Delegate to the complete, properly-implemented version
  // This ensures consistent XSS protection across all validation code
  return completeSanitizeString(input)
}

/**
 * Validates that a value is a valid enum member
 *
 * @param value - Value to check
 * @param enumValues - Allowed enum values
 * @returns True if value is in enum
 */
export function isValidEnum(value: unknown, enumValues: readonly string[]): boolean {
  return typeof value === 'string' && enumValues.includes(value)
}

/**
 * Type guards for common validation
 */

export function isValidEmail(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) &&
    value.length <= 254
  )
}

export function isValidPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128
}

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && Number.isInteger(value)
}

export function isValidLimit(value: unknown): value is number {
  return typeof value === 'number' && value >= 1 && value <= 1000 && Number.isInteger(value)
}

export function isValidId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 100 &&
    /^[a-zA-Z0-9_-]+$/.test(value)
  )
}

/**
 * Safe JSON parsing with validation
 *
 * @param json - JSON string to parse
 * @param fallback - Fallback value if parsing fails
 * @returns Parsed object or fallback value
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

/**
 * Meeting Type Validation
 * Whitelist of allowed meeting types - prevents path traversal attacks
 */
export const VALID_MEETING_TYPES = ['standup', 'review', 'planning', 'retrospective', 'sync'] as const
export type ValidMeetingType = typeof VALID_MEETING_TYPES[number]

export const MeetingTypeSchema = z
  .string()
  .min(1, 'Meeting type is required')
  .max(50, 'Meeting type must not exceed 50 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Meeting type must contain only alphanumeric characters, underscores, and hyphens')
  .refine(
    (val): val is ValidMeetingType => VALID_MEETING_TYPES.includes(val as ValidMeetingType),
    'Meeting type must be one of: ' + VALID_MEETING_TYPES.join(', ')
  )

/**
 * Skill Type Validation
 * Whitelist of allowed skill types - prevents path traversal attacks
 */
export const VALID_SKILL_TYPES = ['meeting_scheduler', 'brain_logger', 'notification_service', 'data_processor'] as const
export type ValidSkillType = typeof VALID_SKILL_TYPES[number]

export const SkillTypeSchema = z
  .string()
  .min(1, 'Skill type is required')
  .max(50, 'Skill type must not exceed 50 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Skill type must contain only alphanumeric characters, underscores, and hyphens')
  .refine(
    (val): val is ValidSkillType => VALID_SKILL_TYPES.includes(val as ValidSkillType),
    'Skill type must be one of: ' + VALID_SKILL_TYPES.join(', ')
  )

/**
 * Meeting Status Validation
 */
export const VALID_MEETING_STATUSES = ['scheduled', 'completed', 'failed', 'cancelled'] as const
export type ValidMeetingStatus = typeof VALID_MEETING_STATUSES[number]

export const MeetingStatusSchema = z
  .string()
  .min(1, 'Meeting status is required')
  .max(50, 'Meeting status must not exceed 50 characters')
  .refine(
    (val): val is ValidMeetingStatus => VALID_MEETING_STATUSES.includes(val as ValidMeetingStatus),
    'Meeting status must be one of: ' + VALID_MEETING_STATUSES.join(', ')
  )

/**
 * Meeting Request Schema
 */
export const MeetingRequestSchema = z.object({
  meeting_type: MeetingTypeSchema,
  skill_triggered: SkillTypeSchema.optional(),
  status: MeetingStatusSchema.optional(),
})

export type MeetingRequest = z.infer<typeof MeetingRequestSchema>

/**
 * Safe path joining with containment validation
 * Prevents directory traversal attacks by:
 * 1. Resolving paths to absolute
 * 2. Checking that result is within base directory
 * 3. Rejecting absolute paths and traversal attempts
 *
 * @param baseDir - Base directory that all paths must be contained within
 * @param filePath - File path to join with base directory
 * @returns Safe joined path
 * @throws Error if path escapes base directory or is absolute
 */
export function safeJoin(baseDir: string, filePath: string): string {
  // FIXED: Use top-level import instead of runtime require()

  // Reject empty paths
  if (!filePath || filePath.trim() === '') {
    throw new Error('Invalid file path')
  }

  // Reject absolute paths (check with isAbsolute)
  if (path.isAbsolute(filePath)) {
    throw new Error('Invalid file path')
  }

  // Also reject paths that start with / or \ (for both Unix and Windows)
  if (filePath.startsWith('/') || filePath.startsWith('\\')) {
    throw new Error('Invalid file path')
  }

  // Reject paths containing .. to prevent traversal
  if (filePath.includes('..')) {
    throw new Error('Invalid file path')
  }

  // Resolve the joined path to handle . and normalize
  const resolvedBase = path.resolve(baseDir)
  const joinedPath = path.resolve(path.join(resolvedBase, filePath))

  // Final containment check: ensure the joined path starts with base directory
  const normalizedBase = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep
  if (!joinedPath.startsWith(normalizedBase) && joinedPath !== resolvedBase) {
    throw new Error('Invalid file path')
  }

  return joinedPath
}

/**
 * Generate a secure random ID
 * Uses UUID v4 for cryptographic strength
 *
 * @param prefix - Optional prefix for the ID
 * @returns Secure random ID
 */
export function generateId(prefix?: string): string {
  // FIXED: Use top-level import instead of runtime require()
  const id = generateUUIDv4()
  return prefix ? `${prefix}_${id}` : id
}
