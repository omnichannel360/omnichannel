/**
 * Comprehensive Input Validation System
 *
 * Provides centralized, type-safe input validation for all API endpoints.
 * Uses Zod for schema-based validation with proper error handling.
 * Includes protection against XSS, SQL injection, and other attack vectors.
 */

import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'

/**
 * EMAIL VALIDATION CONFIGURATION
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX_LENGTH = 254

/**
 * PASSWORD VALIDATION CONFIGURATION
 * FIXED: Now uses shared constants from password-validation-constants.ts
 * to ensure consistent validation across all endpoints
 */
import { PASSWORD_VALIDATION } from './validation/password-validation-constants'

const PASSWORD_MIN_LENGTH = PASSWORD_VALIDATION.minLength
const PASSWORD_MAX_LENGTH = PASSWORD_VALIDATION.maxLength

/**
 * STRING INPUT VALIDATION CONSTRAINTS
 */
const STRING_MIN_LENGTH = 1
const STRING_MAX_LENGTH = 10000

/**
 * NUMBER VALIDATION CONSTRAINTS
 */
const LIMIT_MIN = 1
const LIMIT_MAX = 1000

/**
 * REQUEST SIZE LIMITS
 */
const MAX_REQUEST_BODY_SIZE = 1024 * 1024 // 1MB
const MAX_QUERY_STRING_SIZE = 10 * 1024 // 10KB
const MAX_HEADER_SIZE = 8 * 1024 // 8KB

/**
 * Reusable Zod validators
 */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email format')
  .min(3, 'Email must be at least 3 characters')
  .max(EMAIL_MAX_LENGTH, `Email must be less than ${EMAIL_MAX_LENGTH} characters`)

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be less than ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character')
  .refine((pwd) => !/(.)\1{2,}/.test(pwd), 'Password cannot contain more than 2 consecutive identical characters')
  .refine((pwd) => !PASSWORD_VALIDATION.regex.test(pwd), PASSWORD_VALIDATION.description)

export const StringSchema = z
  .string()
  .min(STRING_MIN_LENGTH, 'String is required')
  .max(STRING_MAX_LENGTH, `String must be less than ${STRING_MAX_LENGTH} characters`)

export const NonEmptyStringSchema = z
  .string()
  .trim()
  .min(1, 'Value is required')
  .max(STRING_MAX_LENGTH, `Value must be less than ${STRING_MAX_LENGTH} characters`)

export const PositiveNumberSchema = z
  .number()
  .int()
  .positive('Value must be a positive number')

export const LimitSchema = z
  .number()
  .int()
  .min(LIMIT_MIN, `Limit must be at least ${LIMIT_MIN}`)
  .max(LIMIT_MAX, `Limit must be at most ${LIMIT_MAX}`)

export const CategorySchema = z
  .string()
  .min(1, 'Category is required')
  .max(100, 'Category must be less than 100 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Category can only contain alphanumeric characters, hyphens, and underscores')

/**
 * AUTH VALIDATION SCHEMAS
 */
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
})

export type LoginRequest = z.infer<typeof LoginRequestSchema>

export const LoginResponseSchema = z.object({
  success: z.boolean(),
  token: z.string().optional(),
  user: z.object({
    email: z.string(),
    role: z.string(),
  }).optional(),
  error: z.string().optional(),
})

export type LoginResponse = z.infer<typeof LoginResponseSchema>

/**
 * BRAIN ENDPOINT VALIDATION SCHEMAS
 */
export const BrainQuerySchema = z.object({
  category: CategorySchema.optional(),
  limit: LimitSchema.optional().default(20),
}).strict()

export type BrainQuery = z.infer<typeof BrainQuerySchema>

/**
 * METRICS ENDPOINT VALIDATION SCHEMAS
 */
export const MetricsQuerySchema = z.object({}).strict()

export type MetricsQuery = z.infer<typeof MetricsQuerySchema>

/**
 * ALERTS VALIDATION SCHEMAS
 */
export const AlertCreateSchema = z.object({
  level: z.enum(['info', 'warning', 'critical']),
  component: z.string().max(100, 'Component must be less than 100 characters'),
  message: z.string().max(2000, 'Message must be less than 2000 characters'),
})

export type AlertCreate = z.infer<typeof AlertCreateSchema>

/**
 * TASK VALIDATION SCHEMAS
 */
export const TaskCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must be less than 500 characters'),
  status: z.enum(['todo', 'in-progress', 'done']).optional().default('todo'),
})

export type TaskCreate = z.infer<typeof TaskCreateSchema>

/**
 * Validation error response structure
 */
export interface ValidationError {
  field: string
  message: string
}

export interface ValidationResult<T> {
  success: boolean
  data?: T
  errors?: ValidationError[]
}

/**
 * Validates request body against a Zod schema
 * @param body - The request body to validate
 * @param schema - Zod schema for validation
 * @returns Validation result with data or errors
 */
export function validateBody<T>(
  body: unknown,
  schema: z.ZodSchema<T>
): ValidationResult<T> {
  try {
    const result = schema.safeParse(body)

    if (!result.success) {
      const errors: Record<string, string[] | undefined> = result.error.flatten().fieldErrors
      const validationErrors: ValidationError[] = []

      for (const [field, messages] of Object.entries(errors)) {
        if (messages && messages.length > 0) {
          validationErrors.push({
            field,
            message: messages[0],
          })
        }
      }

      return {
        success: false,
        errors: validationErrors,
      }
    }

    return {
      success: true,
      data: result.data,
    }
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          field: 'body',
          message: 'Failed to parse request body',
        },
      ],
    }
  }
}

/**
 * Sanitizes string input to prevent XSS attacks and injection patterns
 *
 * SECURITY NOTE: This function performs TWO critical sanitizations:
 * 1. Removes null bytes and control characters (prevents binary injection)
 * 2. Escapes HTML entities (prevents XSS attacks)
 *
 * Both steps are REQUIRED for complete protection.
 *
 * @param input - String to sanitize
 * @returns Sanitized string safe for HTML context
 */
export function sanitizeString(input: string): string {
  // Step 1: Remove null bytes and control characters (consolidated into single regex)
  let sanitized = input.replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, '')

  // Step 2: Escape HTML entities to prevent XSS
  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
  }
  sanitized = sanitized.replace(/[&<>"'\/]/g, (char) => htmlEscapeMap[char] || char)

  return sanitized.trim()
}

/**
 * Detects common SQL injection patterns
 */
export function detectSqlInjection(input: string): boolean {
  const suspiciousPatterns = [
    /(\bOR\b|\bAND\b)[\s\S]*?=/i,
    /(\bUNION\b)[\s\S]*?(\bSELECT\b)/i,
    /(\bDROP\b|\bDELETE\b|\bTRUNCATE\b)[\s\S]*?(\bFROM\b)/i,
    /(\bINSERT\b|\bUPDATE\b)[\s\S]*?(\bINTO\b|\bSET\b)/i,
    /(\bEXEC\b|\bEXECUTE\b)/i,
    /--[\s]*$/,
    /\/\*[\s\S]*?\*\//,
    /xp_/i,
    /sp_/i,
  ]

  return suspiciousPatterns.some((pattern) => pattern.test(input))
}

/**
 * Validates file name to prevent directory traversal attacks
 */
export function sanitizeFileName(filename: string): { valid: boolean; sanitized?: string } {
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return { valid: false }
  }

  if (filename.includes('\0')) {
    return { valid: false }
  }

  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '')

  if (sanitized.length === 0 || sanitized.length > 255) {
    return { valid: false }
  }

  return { valid: true, sanitized }
}

/**
 * Validates URL format and protocol
 */
export function validateUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return ['http:', 'https:'].includes(url.protocol) && !url.href.startsWith('javascript:') && !url.href.startsWith('data:')
  } catch {
    return false
  }
}

/**
 * Validates request size limits
 */
export function validateRequestSize(request: NextRequest): boolean {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const size = parseInt(contentLength, 10)
    if (size > MAX_REQUEST_BODY_SIZE) {
      return false
    }
  }
  return true
}

/**
 * Validates query string size
 */
export function validateQuerySize(url: URL): boolean {
  return url.search.length <= MAX_QUERY_STRING_SIZE
}

/**
 * Validates query parameters against a Zod schema
 * @param searchParams - URLSearchParams from request
 * @param schema - Zod schema for validation
 * @returns Validation result with data or errors
 */
export function validateQuery<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): ValidationResult<T> {
  try {
    const params: Record<string, string | string[]> = {}

    // Convert URLSearchParams to plain object
    searchParams.forEach((value, key) => {
      if (key in params) {
        const existing = params[key]
        params[key] = Array.isArray(existing) ? [...existing, value] : [existing as string, value]
      } else {
        params[key] = value
      }
    })

    // Convert string numbers to actual numbers for numeric fields
    const processedParams = Object.entries(params).reduce((acc, [key, value]) => {
      if (typeof value === 'string' && /^\d+$/.test(value)) {
        acc[key] = parseInt(value, 10)
      } else {
        acc[key] = value
      }
      return acc
    }, {} as Record<string, unknown>)

    const result = schema.safeParse(processedParams)

    if (!result.success) {
      const errors: Record<string, string[] | undefined> = result.error.flatten().fieldErrors
      const validationErrors: ValidationError[] = []

      for (const [field, messages] of Object.entries(errors)) {
        if (messages && messages.length > 0) {
          validationErrors.push({
            field,
            message: messages[0],
          })
        }
      }

      return {
        success: false,
        errors: validationErrors,
      }
    }

    return {
      success: true,
      data: result.data,
    }
  } catch (error) {
    return {
      success: false,
      errors: [{
        field: 'query',
        message: 'Invalid query parameters format',
      }],
    }
  }
}

/**
 * Creates a standardized validation error response
 * @param errors - Array of validation errors
 * @returns NextResponse with validation error details
 */
export function createValidationErrorResponse(errors: ValidationError[]): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: 'Validation failed',
      validationErrors: errors,
    },
    { status: 400 }
  )
}

/**
 * Input sanitization utilities
 */


/**
 * Validates that a value is a valid enum member
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
  if (typeof value !== 'string') return false
  return EmailSchema.safeParse(value).success
}

export function isValidPassword(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return PasswordSchema.safeParse(value).success
}

export function isPositiveNumber(value: unknown): value is number {
  if (typeof value !== 'number') return false
  return value > 0 && Number.isInteger(value)
}

export function isValidLimit(value: unknown): value is number {
  if (typeof value !== 'number') return false
  return value >= LIMIT_MIN && value <= LIMIT_MAX && Number.isInteger(value)
}
