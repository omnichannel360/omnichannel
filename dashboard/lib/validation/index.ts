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
import { createLogger } from '@/lib/logger'

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
 * Removes common injection attack patterns from strings
 * - Null bytes
 * - Control characters
 * - Common XSS patterns (handled by Zod schemas primarily)
 *
 * @param input - String to sanitize
 * @returns Sanitized string
 */
export function sanitizeString(input: string): string {
  // Remove null bytes
  let sanitized = input.replace(/\0/g, '')

  // Remove control characters (except whitespace)
  sanitized = sanitized.replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, '')

  return sanitized.trim()
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
