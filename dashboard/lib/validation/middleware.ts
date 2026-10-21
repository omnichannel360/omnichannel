/**
 * Validation middleware for Next.js API routes
 * Handles request body and query parameter validation with Zod
 * Includes header validation, request size limits, and sanitization
 */

import { NextRequest, NextResponse } from 'next/server'
import { ZodSchema, ZodError } from 'zod'
import { createLogger } from '@/lib/logger'

const logger = createLogger('validation-middleware')

/**
 * Configuration for request validation
 */
const VALIDATION_CONFIG = {
  MAX_BODY_SIZE: 1024 * 1024, // 1MB max request body
  MAX_QUERY_SIZE: 10 * 1024, // 10KB max query string
  REQUIRED_HEADERS: ['content-type'],
  ALLOWED_CONTENT_TYPES: ['application/json'],
}

/**
 * Validation error response structure
 */
interface ValidationError {
  field: string
  message: string
  code?: string
}

interface ValidationErrorResponse {
  success: false
  error: string
  code?: string
  validationErrors?: ValidationError[]
  timestamp: string
}

/**
 * Validate request headers
 */
function validateHeaders(request: NextRequest): { valid: boolean; error?: string } {
  const contentType = request.headers.get('content-type')

  if (!contentType) {
    return {
      valid: false,
      error: 'Missing Content-Type header',
    }
  }

  // Check if content-type starts with allowed type (ignores charset, etc)
  const isAllowed = VALIDATION_CONFIG.ALLOWED_CONTENT_TYPES.some((type) =>
    contentType.toLowerCase().startsWith(type)
  )

  if (!isAllowed) {
    return {
      valid: false,
      error: `Invalid Content-Type: ${contentType}. Expected application/json`,
    }
  }

  return { valid: true }
}

/**
 * Validate request size limits
 */
function validateRequestSize(request: NextRequest, maxSize: number): { valid: boolean; error?: string } {
  const contentLength = request.headers.get('content-length')

  if (contentLength) {
    const size = parseInt(contentLength, 10)
    if (size > maxSize) {
      return {
        valid: false,
        error: `Request body too large: ${size} bytes (max: ${maxSize} bytes)`,
      }
    }
  }

  return { valid: true }
}

/**
 * Format Zod errors into a human-readable list
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
 * Includes header validation and request size limits
 * Usage: const data = await validateBody(request, MySchema)
 */
export async function validateBody<T>(
  request: NextRequest,
  schema: ZodSchema
): Promise<{ success: true; data: T } | { success: false; response: NextResponse<ValidationErrorResponse> }> {
  try {
    // Validate request headers
    const headerCheck = validateHeaders(request)
    if (!headerCheck.valid) {
      logger.warn('Request header validation failed', {
        path: request.nextUrl.pathname,
        method: request.method,
        error: headerCheck.error,
      })

      return {
        success: false,
        response: NextResponse.json(
          {
            success: false,
            error: headerCheck.error || 'Invalid request headers',
            timestamp: new Date().toISOString(),
          } as ValidationErrorResponse,
          { status: 400 }
        ),
      }
    }

    // Validate request size
    const sizeCheck = validateRequestSize(request, VALIDATION_CONFIG.MAX_BODY_SIZE)
    if (!sizeCheck.valid) {
      logger.warn('Request size validation failed', {
        path: request.nextUrl.pathname,
        method: request.method,
        error: sizeCheck.error,
      })

      return {
        success: false,
        response: NextResponse.json(
          {
            success: false,
            error: sizeCheck.error || 'Request body too large',
            timestamp: new Date().toISOString(),
          } as ValidationErrorResponse,
          { status: 413 }
        ),
      }
    }

    let body: unknown

    // Explicit try-catch for JSON parsing
    try {
      body = await request.json()
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error'
      const errorType = parseError instanceof SyntaxError ? 'SyntaxError' : 'JSONParseError'

      logger.error('JSON parse error in request body', parseError, {
        path: request.nextUrl.pathname,
        method: request.method,
        errorType,
        errorMessage,
        errorStack: parseError instanceof Error ? parseError.stack : undefined,
      })

      return {
        success: false,
        response: NextResponse.json(
          {
            success: false,
            error: `Invalid JSON in request body: ${errorMessage}`,
            code: 'INVALID_JSON',
            timestamp: new Date().toISOString(),
          } as ValidationErrorResponse,
          { status: 400 }
        ),
      }
    }

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
 * Includes query size validation
 * Usage: const query = await validateQuery(request, MyQuerySchema)
 */
export async function validateQuery<T>(
  request: NextRequest,
  schema: ZodSchema
): Promise<{ success: true; data: T } | { success: false; response: NextResponse<ValidationErrorResponse> }> {
  try {
    // Validate query string size
    const url = new URL(request.url)
    const queryString = url.search
    if (queryString.length > VALIDATION_CONFIG.MAX_QUERY_SIZE) {
      logger.warn('Query string too large', {
        path: request.nextUrl.pathname,
        method: request.method,
        size: queryString.length,
        maxSize: VALIDATION_CONFIG.MAX_QUERY_SIZE,
      })

      return {
        success: false,
        response: NextResponse.json(
          {
            success: false,
            error: 'Query string too large',
            timestamp: new Date().toISOString(),
          } as ValidationErrorResponse,
          { status: 414 }
        ),
      }
    }

    const { searchParams } = url
    const queryObject: Record<string, unknown> = {}

    // Convert URLSearchParams to object with whitespace normalization
    // FIXED: Trim all string values to prevent data quality issues
    // Whitespace in query parameters is typically unintentional (e.g., accidental spaces)
    // Trimming ensures consistent behavior and prevents search/filter failures
    searchParams.forEach((value, key) => {
      const trimmed = value.trim()

      // Try to parse as number if it looks like one (avoid parsing "NaN", "Infinity", etc)
      if (trimmed !== '' && !['NaN', 'Infinity', '-Infinity'].includes(trimmed)) {
        const num = Number(trimmed)
        // Only use if it's a finite number (isNaN and isFinite both return false for non-numbers)
        if (!isNaN(num) && isFinite(num)) {
          queryObject[key] = num
        } else {
          // Parse failed, use trimmed string
          queryObject[key] = trimmed
        }
      } else if (trimmed.toLowerCase() === 'true') {
        queryObject[key] = true
      } else if (trimmed.toLowerCase() === 'false') {
        queryObject[key] = false
      } else {
        // Use trimmed value for all strings to normalize whitespace
        queryObject[key] = trimmed
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
          // SECURITY: Don't log raw query parameters - may contain sensitive data
          // queryKeys: Object.keys(queryObject), // Log keys only, not values
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
 * Validate JSON body and return parsed data or error response
 * Shorthand for validateBody that throws on failure (use in try-catch)
 */
export async function parseAndValidateBody<T>(
  request: NextRequest,
  schema: ZodSchema
): Promise<T> {
  const result = await validateBody<T>(request, schema)

  if (!result.success) {
    throw result.response
  }

  return result.data
}

/**
 * Validate query params and return parsed data or error response
 * Shorthand for validateQuery that throws on failure (use in try-catch)
 */
export async function parseAndValidateQuery<T>(
  request: NextRequest,
  schema: ZodSchema
): Promise<T> {
  const result = await validateQuery<T>(request, schema)

  if (!result.success) {
    throw result.response
  }

  return result.data
}
