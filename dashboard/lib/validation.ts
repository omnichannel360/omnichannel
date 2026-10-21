import { z } from 'zod'
import crypto from 'crypto'

/**
 * Generates a UUID v4 without a prefix
 * @returns A cryptographically secure random UUID
 */
export function generateUUID(): string {
  return crypto.randomUUID()
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

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

import path from 'path'

export function safeJoin(baseDir: string, filename: string): string {
  const safeName = path.basename(filename)
  const fullPath = path.resolve(path.join(baseDir, safeName))
  const resolvedBase = path.resolve(baseDir)
  
  if (!fullPath.startsWith(resolvedBase)) {
    throw new Error('Path traversal attempt detected')
  }
  return fullPath
}
