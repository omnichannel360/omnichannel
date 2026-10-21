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

export const TaskCreateSchema = z.object({
  title: z.string().min(1, 'title required').max(500),
  status: z.enum(['todo', 'in-progress', 'done']).default('todo'),
})

export const TaskUpdateSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(500).optional(),
  status: z.enum(['todo', 'in-progress', 'done']).optional(),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
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
