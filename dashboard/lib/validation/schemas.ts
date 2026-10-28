/**
 * Zod validation schemas for all API inputs
 * Comprehensive input validation following OWASP guidelines
 */

import { z } from 'zod'
import { PASSWORD_VALIDATION } from './password-validation-constants'
import { PasswordSchema as InputValidationPasswordSchema } from '../input-validation'

// Re-export for backward compatibility
export const PasswordSchema = InputValidationPasswordSchema

// Email validation - RFC 5322 compliant
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email format')
  .min(3, 'Email must be at least 3 characters')
  .max(254, 'Email must not exceed 254 characters')

// DEPRECATED: PasswordSchema defined here - use import from input-validation.ts instead
// Imported for backward compatibility

// Weak password for development/testing (optional override)
export const PasswordSchemaWeak = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password must not exceed 128 characters')

// Safe string factory - creates string schemas with XSS protection
// Blocks dangerous patterns: script tags, JavaScript URLs, event handlers, data URIs, eval
// Allows: math operators (<, >), shell metacharacters, HTML entities
function createSafeString(minLength = 0, maxLength = 1000): z.ZodTypeAny {
  let schema = z.string()

  if (minLength > 0) {
    schema = schema.min(minLength, `String must be at least ${minLength} characters`)
  }

  schema = schema.max(maxLength, `String must not exceed ${maxLength} characters`)

  return schema.refine(
    (val) => {
      // SECURITY: Reject null bytes (null-byte injection / string truncation)
      if (val.includes('\0')) {
        return false
      }

      const lowerVal = val.toLowerCase()
      // SECURITY: Block execution vectors - rendering safety handled elsewhere
      // Remove whitespace from potentially dangerous patterns to catch obfuscation
      const noWhitespace = lowerVal.replace(/\s/g, '')

      // Check script tags (literal and obfuscated with whitespace)
      if (lowerVal.includes('<script') || noWhitespace.includes('<script')) {
        return false
      }
      if (lowerVal.includes('</script>') || noWhitespace.includes('</script>')) {
        return false
      }

      // Check javascript: protocol (literal, spaces, and URL-encoded)
      if (lowerVal.includes('javascript:')) {
        return false
      }
      if (noWhitespace.includes('javascript:')) {
        return false
      }
      if (lowerVal.includes('javascript%20:') || lowerVal.includes('javascript%3a')) {
        return false
      }

      // Check data: URIs
      if (lowerVal.includes('data:text/html')) {
        return false
      }

      // Check eval() calls
      if (/eval\s*\(/i.test(val)) {
        return false
      }

      // Check HTML event handler attributes (onclick=, onerror=, onload=, etc.)
      // This prevents XSS via: <img src=x onerror=alert(1)>, <div onclick=...>, etc.
      if (/on\w+\s*=/i.test(val)) {
        return false
      }

      // Check for iframe, embed, and object tags
      if (/<(iframe|embed|object)/i.test(val)) {
        return false
      }

      // Check for vbscript: protocol
      if (/vbscript:/i.test(val)) {
        return false
      }

      // Check for SVG with event handlers or scripts
      if (/<svg/i.test(val) || /<svg[^>]*on/i.test(val)) {
        return false
      }

      // Check URL-decoded dangerous patterns (catches obfuscation like java%73cript:)
      try {
        const decoded = decodeURIComponent(lowerVal)
        if (decoded.includes('javascript:')) {
          return false
        }
        if (decoded.includes('<script')) {
          return false
        }
        if (decoded.includes('</script>')) {
          return false
        }
        if (decoded.includes('data:text/html')) {
          return false
        }
        // Also check for event handlers in decoded form
        if (/on\w+\s*=/i.test(decoded)) {
          return false
        }
      } catch {
        // Malformed URL encoding is benign in this context - let it through
      }

      return true
    },
    'String contains forbidden XSS patterns'
  )
}

export const SafeStringSchema = createSafeString()

// Category validation
export const CategorySchema = z
  .string()
  .min(1, 'Category must not be empty')
  .max(50, 'Category must not exceed 50 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Category must contain only alphanumeric characters, underscores, and hyphens')

// ID validation
export const IdSchema = z
  .string()
  .min(1, 'ID must not be empty')
  .max(100, 'ID must not exceed 100 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'ID must contain only alphanumeric characters, underscores, and hyphens')

// Numeric range validation
export const PositiveNumberSchema = z
  .number()
  .int('Must be an integer')
  .positive('Must be a positive number')
  .max(999999, 'Number must not exceed 999999')

// Limit/offset validation for pagination
export const PaginationSchema = z.object({
  limit: z
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(1000, 'Limit must not exceed 1000')
    .optional()
    .default(20),
  offset: z
    .number()
    .int('Offset must be an integer')
    .min(0, 'Offset must be 0 or greater')
    .optional()
    .default(0),
})

// ============================================================================
// API ENDPOINT SCHEMAS
// ============================================================================

// Auth: Login
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema, // Using strong password requirements for security
}).strict() // Reject unknown fields

export type LoginRequest = z.infer<typeof LoginRequestSchema>

// Auth: Verify
export const VerifyRequestSchema = z.object({
  token: z
    .string()
    .min(10, 'Token must be at least 10 characters')
    .max(1000, 'Token must not exceed 1000 characters'),
})

export type VerifyRequest = z.infer<typeof VerifyRequestSchema>

// Brain: Query parameters
export const BrainQuerySchema = z.object({
  category: CategorySchema.optional(),
  limit: z
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must not exceed 100')
    .optional()
    .default(20),
}).strict() // Reject unknown query parameters

export type BrainQuery = z.infer<typeof BrainQuerySchema>

// Metrics: Query parameters
export const MetricsQuerySchema = z.object({
  period: z
    .enum(['day', 'week', 'month', 'year'], {
      errorMap: () => ({ message: 'Period must be one of: day, week, month, year' }),
    })
    .optional()
    .default('day'),
  format: z
    .enum(['json', 'csv'], {
      errorMap: () => ({ message: 'Format must be one of: json, csv' }),
    })
    .optional()
    .default('json'),
})

export type MetricsQuery = z.infer<typeof MetricsQuerySchema>

// Conductor: Request body
export const ConductorRequestSchema = z.object({
  action: SafeStringSchema,
  params: z.record(z.unknown()).optional().default({}),
  timeout: z
    .number()
    .int('Timeout must be an integer')
    .min(100, 'Timeout must be at least 100ms')
    .max(300000, 'Timeout must not exceed 300000ms (5 minutes)')
    .optional()
    .default(30000),
})

export type ConductorRequest = z.infer<typeof ConductorRequestSchema>

// Health: No validation needed (no parameters)
export const HealthQuerySchema = z.object({
  detailed: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((val) => val === 'true'),
})

export type HealthQuery = z.infer<typeof HealthQuerySchema>

// Kanban: Request body
export const KanbanItemSchema = z.object({
  title: createSafeString(1, 1000),
  description: SafeStringSchema.optional(),
  status: z
    .enum(['todo', 'in_progress', 'done'], {
      errorMap: () => ({ message: 'Status must be one of: todo, in_progress, done' }),
    })
    .optional()
    .default('todo'),
  priority: z
    .enum(['low', 'medium', 'high'], {
      errorMap: () => ({ message: 'Priority must be one of: low, medium, high' }),
    })
    .optional()
    .default('medium'),
})

export type KanbanItem = z.infer<typeof KanbanItemSchema>

// Meetings: Request body
export const MeetingSchema = z.object({
  title: createSafeString(1, 1000),
  description: SafeStringSchema.optional(),
  startTime: z
    .string()
    .datetime('Invalid ISO 8601 datetime')
    .optional(),
  endTime: z
    .string()
    .datetime('Invalid ISO 8601 datetime')
    .optional(),
  attendees: z
    .array(EmailSchema)
    .optional()
    .default([]),
})

export type Meeting = z.infer<typeof MeetingSchema>

// Profiles: Request body
export const ProfileUpdateSchema = z.object({
  name: createSafeString(1).optional(),
  email: EmailSchema.optional(),
  role: z
    .enum(['user', 'admin', 'viewer'], {
      errorMap: () => ({ message: 'Role must be one of: user, admin, viewer' }),
    })
    .optional(),
  preferences: z.record(z.unknown()).optional().default({}),
})

export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>

// Alerts: Request body
export const AlertSchema = z.object({
  title: createSafeString(1),
  message: createSafeString(1),
  severity: z
    .enum(['info', 'warning', 'error', 'critical'], {
      errorMap: () => ({ message: 'Severity must be one of: info, warning, error, critical' }),
    })
    .optional()
    .default('info'),
  tags: z
    .array(SafeStringSchema)
    .max(10, 'Maximum 10 tags allowed')
    .optional()
    .default([]),
})

export type Alert = z.infer<typeof AlertSchema>

// Auth Token Generation: Request body
export const AuthTokenRequestSchema = z.object({
  userId: z
    .string()
    .min(1, 'User ID is required')
    .max(100, 'User ID must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'User ID must contain only alphanumeric characters, underscores, and hyphens'),
  email: EmailSchema,
  role: z
    .enum(['user', 'admin', 'viewer'], {
      errorMap: () => ({ message: 'Role must be one of: user, admin, viewer' }),
    })
    .optional()
    .default('user'),
})

export type AuthTokenRequest = z.infer<typeof AuthTokenRequestSchema>

// Conductor: Request body (comprehensive version from schemas)
export const ConductorRequestSchemaComprehensive = z.object({
  message: createSafeString(1, 2000),
  action: SafeStringSchema.optional(),
  params: z.record(z.unknown()).optional().default({}),
  timeout: z
    .number()
    .int('Timeout must be an integer')
    .min(100, 'Timeout must be at least 100ms')
    .max(300000, 'Timeout must not exceed 300000ms (5 minutes)')
    .optional()
    .default(30000),
})

export type ConductorRequestMessage = z.infer<typeof ConductorRequestSchemaComprehensive>

// Auth Token Generation: Request body (alias for consistency)
export const TokenGenerationSchema = AuthTokenRequestSchema
export type TokenGeneration = AuthTokenRequest

// ============================================================================
// ADDITIONAL ENDPOINT SCHEMAS
// ============================================================================

// Profiles: Get profile query parameters
export const ProfileQuerySchema = z.object({
  userId: z
    .string()
    .min(1, 'User ID is required')
    .max(100, 'User ID must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'User ID must contain only alphanumeric characters, underscores, and hyphens')
    .optional(),
})

export type ProfileQuery = z.infer<typeof ProfileQuerySchema>

// Profiles: Delete request
export const ProfileDeleteSchema = z.object({
  userId: z
    .string()
    .min(1, 'User ID is required')
    .max(100, 'User ID must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'User ID must contain only alphanumeric characters, underscores, and hyphens'),
})

export type ProfileDelete = z.infer<typeof ProfileDeleteSchema>

// Auth: Logout request (no required fields, but can have optional body)
export const LogoutRequestSchema = z.object({
  revokeToken: z.boolean().optional().default(true),
})

export type LogoutRequest = z.infer<typeof LogoutRequestSchema>

// Auth: Register request
export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema, // Using strong password requirements for security
  name: createSafeString(1).optional(),
})

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>

// Alerts: Query parameters
export const AlertsQuerySchema = z.object({
  level: z
    .enum(['info', 'warning', 'critical'], {
      errorMap: () => ({ message: 'Level must be one of: info, warning, critical' }),
    })
    .optional(),
  status: z
    .enum(['active', 'resolved'], {
      errorMap: () => ({ message: 'Status must be one of: active, resolved' }),
    })
    .optional(),
  limit: z
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(1000, 'Limit must not exceed 1000')
    .optional()
    .default(50),
  offset: z
    .number()
    .int('Offset must be an integer')
    .min(0, 'Offset must be 0 or greater')
    .optional()
    .default(0),
})

export type AlertsQuery = z.infer<typeof AlertsQuerySchema>

// Alerts: Create alert body (used in alerts route)
export const AlertCreateBodySchema = z.object({
  title: createSafeString(1),
  message: createSafeString(1),
  severity: z
    .enum(['info', 'warning', 'error', 'critical'], {
      errorMap: () => ({ message: 'Severity must be one of: info, warning, error, critical' }),
    })
    .optional()
    .default('info'),
  tags: z
    .array(SafeStringSchema)
    .max(10, 'Maximum 10 tags allowed')
    .optional()
    .default([]),
})

export type AlertCreateBody = z.infer<typeof AlertCreateBodySchema>

// Alerts: Update alert body
export const AlertUpdateBodySchema = z.object({
  alert_id: z
    .string()
    .min(1, 'Alert ID is required')
    .max(100, 'Alert ID must not exceed 100 characters'),
  status: z.enum(['active', 'resolved'], {
    errorMap: () => ({ message: 'Status must be one of: active, resolved' }),
  }),
})

export type AlertUpdateBody = z.infer<typeof AlertUpdateBodySchema>

// Health: Detailed query parameter
export const HealthDetailedQuerySchema = z.object({
  detailed: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((val) => val === 'true'),
})

export type HealthDetailedQuery = z.infer<typeof HealthDetailedQuerySchema>

// Kanban: Query parameters
export const KanbanQuerySchema = z.object({
  status: z
    .enum(['todo', 'in_progress', 'done'], {
      errorMap: () => ({ message: 'Status must be one of: todo, in_progress, done' }),
    })
    .optional(),
  limit: z
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(500, 'Limit must not exceed 500')
    .optional()
    .default(50),
  offset: z
    .number()
    .int('Offset must be an integer')
    .min(0, 'Offset must be 0 or greater')
    .optional()
    .default(0),
})

export type KanbanQuery = z.infer<typeof KanbanQuerySchema>

// Kanban: Create/Update item body
export const KanbanCreateSchema = z.object({
  title: createSafeString(1),
  description: SafeStringSchema.optional(),
  status: z
    .enum(['todo', 'in_progress', 'done'], {
      errorMap: () => ({ message: 'Status must be one of: todo, in_progress, done' }),
    })
    .optional()
    .default('todo'),
  priority: z
    .enum(['low', 'medium', 'high'], {
      errorMap: () => ({ message: 'Priority must be one of: low, medium, high' }),
    })
    .optional()
    .default('medium'),
})

export type KanbanCreate = z.infer<typeof KanbanCreateSchema>

// Meetings: Query parameters
export const MeetingsQuerySchema = z.object({
  status: z
    .enum(['scheduled', 'completed', 'failed'], {
      errorMap: () => ({ message: 'Status must be one of: scheduled, completed, failed' }),
    })
    .optional(),
  limit: z
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(500, 'Limit must not exceed 500')
    .optional()
    .default(50),
  offset: z
    .number()
    .int('Offset must be an integer')
    .min(0, 'Offset must be 0 or greater')
    .optional()
    .default(0),
})

export type MeetingsQuery = z.infer<typeof MeetingsQuerySchema>

// Meetings: Create/Update meeting body
export const MeetingCreateSchema = z.object({
  title: createSafeString(1),
  description: SafeStringSchema.optional(),
  startTime: z
    .string()
    .datetime('Invalid ISO 8601 datetime')
    .optional(),
  endTime: z
    .string()
    .datetime('Invalid ISO 8601 datetime')
    .optional(),
  attendees: z
    .array(EmailSchema)
    .optional()
    .default([]),
})

export type MeetingCreate = z.infer<typeof MeetingCreateSchema>

// Auth: Register (alias for consistency)
export const AuthRegisterSchema = RegisterRequestSchema
export type AuthRegister = RegisterRequest
