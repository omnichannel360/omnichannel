import { z } from 'zod'
import { generateId as generatePlainId, generatePrefixedId, generateUUIDv4 } from './uuid'
import path from 'path'

/**
 * Re-exports and wrappers for UUID generation
 * Uses the uuid.ts implementation for consistency
 */

/**
 * Generates a UUID v4 without a prefix
 * @returns A cryptographically secure random UUID (RFC 4122 compliant)
 */
export function generateUUID(): string {
  return generateUUIDv4()
}

/**
 * Generates a unique ID, optionally with a prefix
 * @param prefix - Optional prefix for the ID (e.g., 'meeting', 'alert')
 * @returns A prefixed UUID (e.g., 'meeting_550e8400-e29b-41d4-a716-446655440000') or unprefixed UUID
 */
export function generateId(prefix?: string): string {
  if (!prefix) {
    return generatePlainId()
  }
  return generatePrefixedId(prefix)
}

export const MeetingTypeSchema = z
  .string()
  .min(1, 'meeting_type required')
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'meeting_type invalid')

export const SkillTypeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'skill_type invalid')

export const MeetingStatusSchema = z.enum(['scheduled', 'completed', 'failed'])
export const AlertLevelSchema = z.enum(['info', 'warning', 'critical'])
export const AlertStatusSchema = z.enum(['active', 'resolved'])

// Health status enums
export const HealthStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy'])
export const ComponentStatusSchema = z.enum(['operational', 'no_activity', 'logging', 'inactive', 'loaded', 'missing'])

export const MeetingRequestSchema = z.object({
  message: z.string().optional(),
  meeting_type: MeetingTypeSchema.optional(),
  participants: z.array(z.string()).optional(),
})

export const AlertCreateSchema = z.object({
  level: AlertLevelSchema,
  component: z.string().max(100),
  message: z.string().max(2000),
})

export const AlertUpdateSchema = z.object({
  alert_id: z.string(),
  status: AlertStatusSchema,
})

// Task status enum (extracted for reusability and consistency)
export const TaskStatusSchema = z.enum(['todo', 'in-progress', 'done'])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const TaskCreateSchema = z.object({
  title: z.string().min(1, 'title required').max(500),
  status: TaskStatusSchema.default('todo'),
})

export type AlertLevel = z.infer<typeof AlertLevelSchema>
export type AlertStatus = z.infer<typeof AlertStatusSchema>
export type MeetingStatus = z.infer<typeof MeetingStatusSchema>

export const TaskUpdateSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(500).optional(),
  status: TaskStatusSchema.optional(),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
})

// Health status validation schemas
export const HealthComponentSchema = z.object({
  status: ComponentStatusSchema,
  response_time_ms: z.number().nonnegative(),
  log_count: z.number().nonnegative().optional(),
  latest_timestamp: z.string().nullable().optional(),
  skill_count: z.number().nonnegative().optional(),
})

export const HealthStatusResponseSchema = z.object({
  status: HealthStatusSchema,
  timestamp: z.string().datetime(),
  components: z.object({
    meetings_api: HealthComponentSchema,
    conductor_api: HealthComponentSchema,
    company_brain: HealthComponentSchema,
    skill_registry: HealthComponentSchema,
  }),
  metrics: z.object({
    total_meetings_processed: z.number().nonnegative(),
    total_skills_triggered: z.number().nonnegative(),
    success_rate: z.number().min(0).max(1),
    recent_logs: z.number().nonnegative(),
  }),
  alerts: z.array(z.string()),
})

export function safeJoin(baseDir: string, filename: string): string {
  const safeName = path.basename(filename)
  const fullPath = path.resolve(path.join(baseDir, safeName))
  const resolvedBase = path.resolve(baseDir)

  if (!fullPath.startsWith(resolvedBase)) {
    throw new Error('Path traversal attempt detected')
  }
  return fullPath
}

/**
 * Enum Validation System
 * Centralized validation for all status/level fields across the application
 */

// Enum value maps for runtime validation and type safety
export const ENUM_VALUES = {
  // Alert enums
  AlertLevel: ['info', 'warning', 'critical'] as const,
  AlertStatus: ['active', 'resolved'] as const,

  // Task enums
  TaskStatus: ['todo', 'in-progress', 'done'] as const,

  // Meeting enums
  MeetingStatus: ['scheduled', 'completed', 'failed'] as const,

  // Health enums
  HealthStatus: ['healthy', 'degraded', 'unhealthy'] as const,
  ComponentStatus: ['operational', 'no_activity', 'logging', 'inactive', 'loaded', 'missing'] as const,
} as const

// Type definitions extracted from schemas
export type AlertLevel = z.infer<typeof AlertLevelSchema>
export type AlertStatus = z.infer<typeof AlertStatusSchema>
export type MeetingStatus = z.infer<typeof MeetingStatusSchema>
export type HealthStatus = z.infer<typeof HealthStatusSchema>
export type ComponentStatus = z.infer<typeof ComponentStatusSchema>

/**
 * Validates that a value is a valid enum member
 * @param value - The value to validate
 * @param enumValues - Array of valid enum values
 * @returns true if value is in enumValues, false otherwise
 */
export function isValidEnumValue<T extends readonly string[]>(
  value: unknown,
  enumValues: T
): value is T[number] {
  return typeof value === 'string' && enumValues.includes(value as T[number])
}

/**
 * Validates and safely casts a value to an enum type
 * @param value - The value to validate
 * @param enumName - Name of the enum for error messages
 * @param enumValues - Array of valid enum values
 * @returns The validated enum value
 * @throws Error if value is not valid
 */
export function validateEnum<T extends readonly string[]>(
  value: unknown,
  enumName: string,
  enumValues: T
): T[number] {
  if (!isValidEnumValue(value, enumValues)) {
    throw new Error(
      `Invalid ${enumName}: "${value}". Must be one of: ${enumValues.join(', ')}`
    )
  }
  return value
}

/**
 * Returns all valid enum values for a given enum type
 * Useful for documentation and UI generation
 */
export function getEnumValues(enumName: keyof typeof ENUM_VALUES): readonly string[] {
  return ENUM_VALUES[enumName]
}

/**
 * Type guard for alert levels
 */
export function isAlertLevel(value: unknown): value is AlertLevel {
  return isValidEnumValue(value, ENUM_VALUES.AlertLevel)
}

/**
 * Type guard for alert status
 */
export function isAlertStatus(value: unknown): value is AlertStatus {
  return isValidEnumValue(value, ENUM_VALUES.AlertStatus)
}

/**
 * Type guard for task status
 */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return isValidEnumValue(value, ENUM_VALUES.TaskStatus)
}

/**
 * Type guard for meeting status
 */
export function isMeetingStatus(value: unknown): value is MeetingStatus {
  return isValidEnumValue(value, ENUM_VALUES.MeetingStatus)
}

/**
 * Type guard for health status
 */
export function isHealthStatus(value: unknown): value is HealthStatus {
  return isValidEnumValue(value, ENUM_VALUES.HealthStatus)
}

/**
 * Type guard for component status
 */
export function isComponentStatus(value: unknown): value is ComponentStatus {
  return isValidEnumValue(value, ENUM_VALUES.ComponentStatus)
}

/**
 * Validates Zod schema parse results and provides detailed error messages
 * @param result - Result from schema.safeParse()
 * @param context - Context for error message (e.g., "alert creation")
 * @returns Formatted error message or null if successful
 */
export function getZodErrorMessage(
  result: z.SafeParseReturnType<unknown, unknown>,
  context?: string
): string | null {
  if (result.success) return null

  const fieldErrors = result.error.flatten().fieldErrors
  const errors: string[] = []

  for (const [field, fieldErrorList] of Object.entries(fieldErrors)) {
    if (fieldErrorList && fieldErrorList.length > 0) {
      errors.push(`${field}: ${fieldErrorList.join(', ')}`)
    }
  }

  const message = errors.length > 0 ? errors.join('; ') : 'Validation failed'
  return context ? `${context}: ${message}` : message
}
