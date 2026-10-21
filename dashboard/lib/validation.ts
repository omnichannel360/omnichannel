import { randomUUID } from 'crypto'
import path from 'path'
import { z } from 'zod'

export const MeetingStatusSchema = z.enum(['scheduled', 'completed', 'failed'])
export const AlertLevelSchema = z.enum(['info', 'warning', 'critical'])
export const AlertStatusSchema = z.enum(['active', 'resolved'])

export type MeetingStatus = z.infer<typeof MeetingStatusSchema>
export type AlertLevel = z.infer<typeof AlertLevelSchema>
export type AlertStatus = z.infer<typeof AlertStatusSchema>

/**
 * Whitelist of allowed meeting types for path safety.
 * These are the only values permitted in filenames.
 * Any attempt to use other values will be rejected.
 */
export const VALID_MEETING_TYPES = new Set([
  'planning',
  'standup',
  'retrospective',
  'review',
  'brainstorm',
  'sync',
  'onboarding',
  'feedback',
  'training',
  'unknown',
] as const)

export type ValidMeetingType = typeof VALID_MEETING_TYPES extends Set<infer T> ? T : never

/**
 * Whitelist of allowed skill types for path safety.
 * These are the only values permitted in skill_triggered filenames.
 */
export const VALID_SKILL_TYPES = new Set([
  'none',
  'unknown',
  'meeting_dispatch',
  'skill_trigger',
  'workflow_execute',
  'data_capture',
  'analysis',
  'report_generation',
] as const)

export type ValidSkillType = typeof VALID_SKILL_TYPES extends Set<infer T> ? T : never

/**
 * Shared dangerous patterns used in filename validation.
 * Extracted to single source of truth to prevent duplication and inconsistency.
 * These patterns indicate directory traversal or command injection attempts.
 */
const DANGEROUS_PATTERNS = ['..',
  '/',
  '\\',
  '~',
  '$',
  '%',
  '*',
  '?',
  '"',
  "'",
  '<',
  '>',
  '|',
  '\0',
] as const

/**
 * Whitelist of characters allowed in an identifier that ends up in a filename.
 * No dots, slashes, backslashes or colons, so traversal and NTFS stream tricks are impossible.
 * Additionally enforces against common path traversal patterns.
 */
export const MeetingTypeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'meeting_type may only contain letters, digits, _ and -')
  .refine(
    (value) => !DANGEROUS_PATTERNS.some((pattern) => value.includes(pattern)),
    'meeting_type contains forbidden characters'
  )
  .refine(
    (value) => VALID_MEETING_TYPES.has(value as ValidMeetingType),
    'meeting_type must be one of the allowed types'
  )

/**
 * Skill identifier whitelist - same restrictions as meeting_type.
 * Prevents path traversal and injection attacks via skill names.
 */
export const SkillTypeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'skill_triggered may only contain letters, digits, _ and -')
  .refine(
    (value) => !DANGEROUS_PATTERNS.some((pattern) => value.includes(pattern)),
    'skill_triggered contains forbidden characters'
  )
  .refine(
    (value) => VALID_SKILL_TYPES.has(value as ValidSkillType),
    'skill_triggered must be one of the allowed types'
  )

export const MeetingRequestSchema = z
  .object({
    message: z.string().max(2000).optional(),
    meeting_type: MeetingTypeSchema.optional(),
    participants: z.array(z.string().max(100)).max(50).optional(),
  })
  .refine(v => Boolean(v.message || v.meeting_type), {
    message: 'Message or meeting_type required',
  })

export const AlertCreateSchema = z.object({
  level: AlertLevelSchema,
  component: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
})

export const AlertUpdateSchema = z.object({
  alert_id: z.string().min(1).max(100),
  status: AlertStatusSchema,
})

export const TaskStatusSchema = z.enum(['todo', 'in-progress', 'done'])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const TaskCreateSchema = z.object({
  title: z.string().min(1).max(500),
  status: TaskStatusSchema.optional().default('todo'),
})

export const TaskUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(500).optional(),
  status: TaskStatusSchema.optional(),
  assignee: z.string().max(100).optional(),
  dueDate: z.string().optional(),
})

/** Collision-safe ID: optional prefix + random UUID v4. */
export function generateId(prefix?: string): string {
  const id = randomUUID()
  return prefix ? `${prefix}_${id}` : id
}

/**
 * Build a file path inside baseDir from an untrusted name.
 * Defense in depth: basename strip + resolved-path containment check.
 */
export function safeJoin(baseDir: string, fileName: string): string {
  const resolvedBase = path.resolve(baseDir)
  const resolved = path.resolve(resolvedBase, path.basename(fileName))
  if (path.dirname(resolved) !== resolvedBase) {
    throw new Error('Invalid file path')
  }
  return resolved
}
