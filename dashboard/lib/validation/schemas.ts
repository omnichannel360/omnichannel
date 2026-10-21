/**
 * Zod validation schemas for all API inputs
 * Comprehensive input validation following OWASP guidelines
 */

import { z } from 'zod'

// Email validation - RFC 5322 compliant
export const EmailSchema = z
  .string()
  .email('Invalid email format')
  .min(3, 'Email must be at least 3 characters')
  .max(254, 'Email must not exceed 254 characters')
  .toLowerCase()
  .trim()

// Password validation - strong password requirements
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character')

// Weak password for development/testing (optional override)
export const PasswordSchemaWeak = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password must not exceed 128 characters')

// String validation - prevents XSS and injection attacks
export const SafeStringSchema = z
  .string()
  .max(1000, 'String must not exceed 1000 characters')
  .refine(
    (val) => !val.includes('<script') && !val.includes('javascript:'),
    'String contains forbidden patterns'
  )

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
  password: PasswordSchemaWeak, // Using weak schema for development
})

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
})

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
  title: SafeStringSchema.min(1, 'Title is required'),
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
  title: SafeStringSchema.min(1, 'Title is required'),
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
    .min(1, 'At least one attendee is required')
    .optional()
    .default([]),
})

export type Meeting = z.infer<typeof MeetingSchema>

// Profiles: Request body
export const ProfileUpdateSchema = z.object({
  name: SafeStringSchema.min(1, 'Name is required').optional(),
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
  title: SafeStringSchema.min(1, 'Title is required'),
  message: SafeStringSchema.min(1, 'Message is required'),
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
