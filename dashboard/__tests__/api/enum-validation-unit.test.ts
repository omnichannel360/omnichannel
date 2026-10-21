/**
 * Unit Tests: Enum Validation Schemas
 * Validates all enum schemas independently for correctness
 */

import {
  AlertLevelSchema,
  AlertStatusSchema,
  TaskStatusSchema,
  MeetingStatusSchema,
  HealthStatusSchema,
  ComponentStatusSchema,
  AlertCreateSchema,
  AlertUpdateSchema,
  TaskCreateSchema,
  TaskUpdateSchema,
  ENUM_VALUES,
  isValidEnumValue,
} from '@/lib/validation'

describe('Enum Schemas - Unit Tests', () => {
  describe('AlertLevelSchema - Valid Values', () => {
    test('accepts info', () => {
      expect(AlertLevelSchema.safeParse('info').success).toBe(true)
    })
    test('accepts warning', () => {
      expect(AlertLevelSchema.safeParse('warning').success).toBe(true)
    })
    test('accepts critical', () => {
      expect(AlertLevelSchema.safeParse('critical').success).toBe(true)
    })
  })

  describe('AlertLevelSchema - Invalid Values', () => {
    test('rejects debug', () => {
      expect(AlertLevelSchema.safeParse('debug').success).toBe(false)
    })
    test('rejects error', () => {
      expect(AlertLevelSchema.safeParse('error').success).toBe(false)
    })
    test('rejects uppercase INFO', () => {
      expect(AlertLevelSchema.safeParse('INFO').success).toBe(false)
    })
    test('rejects empty string', () => {
      expect(AlertLevelSchema.safeParse('').success).toBe(false)
    })
    test('rejects null', () => {
      expect(AlertLevelSchema.safeParse(null).success).toBe(false)
    })
    test('rejects number', () => {
      expect(AlertLevelSchema.safeParse(123).success).toBe(false)
    })
    test('rejects boolean', () => {
      expect(AlertLevelSchema.safeParse(true).success).toBe(false)
    })
  })

  describe('AlertStatusSchema - Valid Values', () => {
    test('accepts active', () => {
      expect(AlertStatusSchema.safeParse('active').success).toBe(true)
    })
    test('accepts resolved', () => {
      expect(AlertStatusSchema.safeParse('resolved').success).toBe(true)
    })
  })

  describe('AlertStatusSchema - Invalid Values', () => {
    test('rejects pending', () => {
      expect(AlertStatusSchema.safeParse('pending').success).toBe(false)
    })
    test('rejects ACTIVE', () => {
      expect(AlertStatusSchema.safeParse('ACTIVE').success).toBe(false)
    })
    test('rejects null', () => {
      expect(AlertStatusSchema.safeParse(null).success).toBe(false)
    })
  })

  describe('TaskStatusSchema - Valid Values', () => {
    test('accepts todo', () => {
      expect(TaskStatusSchema.safeParse('todo').success).toBe(true)
    })
    test('accepts in-progress', () => {
      expect(TaskStatusSchema.safeParse('in-progress').success).toBe(true)
    })
    test('accepts done', () => {
      expect(TaskStatusSchema.safeParse('done').success).toBe(true)
    })
  })

  describe('TaskStatusSchema - Invalid Values', () => {
    test('rejects completed', () => {
      expect(TaskStatusSchema.safeParse('completed').success).toBe(false)
    })
    test('rejects in_progress (underscore)', () => {
      expect(TaskStatusSchema.safeParse('in_progress').success).toBe(false)
    })
    test('rejects TODO (uppercase)', () => {
      expect(TaskStatusSchema.safeParse('TODO').success).toBe(false)
    })
  })

  describe('MeetingStatusSchema', () => {
    test('accepts scheduled', () => {
      expect(MeetingStatusSchema.safeParse('scheduled').success).toBe(true)
    })
    test('accepts completed', () => {
      expect(MeetingStatusSchema.safeParse('completed').success).toBe(true)
    })
    test('accepts failed', () => {
      expect(MeetingStatusSchema.safeParse('failed').success).toBe(true)
    })
    test('rejects pending', () => {
      expect(MeetingStatusSchema.safeParse('pending').success).toBe(false)
    })
  })

  describe('HealthStatusSchema', () => {
    test('accepts healthy', () => {
      expect(HealthStatusSchema.safeParse('healthy').success).toBe(true)
    })
    test('accepts degraded', () => {
      expect(HealthStatusSchema.safeParse('degraded').success).toBe(true)
    })
    test('accepts unhealthy', () => {
      expect(HealthStatusSchema.safeParse('unhealthy').success).toBe(true)
    })
    test('rejects ok', () => {
      expect(HealthStatusSchema.safeParse('ok').success).toBe(false)
    })
  })

  describe('ComponentStatusSchema', () => {
    test('accepts operational', () => {
      expect(ComponentStatusSchema.safeParse('operational').success).toBe(true)
    })
    test('accepts no_activity', () => {
      expect(ComponentStatusSchema.safeParse('no_activity').success).toBe(true)
    })
    test('accepts logging', () => {
      expect(ComponentStatusSchema.safeParse('logging').success).toBe(true)
    })
    test('rejects error', () => {
      expect(ComponentStatusSchema.safeParse('error').success).toBe(false)
    })
  })

  describe('AlertCreateSchema', () => {
    test('accepts valid alert with critical level', () => {
      const result = AlertCreateSchema.safeParse({
        level: 'critical',
        component: 'database',
        message: 'Connection timeout',
      })
      expect(result.success).toBe(true)
    })

    test('rejects alert with invalid level', () => {
      const result = AlertCreateSchema.safeParse({
        level: 'fatal',
        component: 'database',
        message: 'test',
      })
      expect(result.success).toBe(false)
    })

    test('rejects alert with missing level', () => {
      const result = AlertCreateSchema.safeParse({
        component: 'database',
        message: 'test',
      })
      expect(result.success).toBe(false)
    })

    test('rejects component exceeding 100 chars', () => {
      const result = AlertCreateSchema.safeParse({
        level: 'info',
        component: 'x'.repeat(101),
        message: 'test',
      })
      expect(result.success).toBe(false)
    })

    test('rejects message exceeding 2000 chars', () => {
      const result = AlertCreateSchema.safeParse({
        level: 'info',
        component: 'api',
        message: 'x'.repeat(2001),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('AlertUpdateSchema', () => {
    test('accepts valid alert update', () => {
      const result = AlertUpdateSchema.safeParse({
        alert_id: 'alert_123',
        status: 'resolved',
      })
      expect(result.success).toBe(true)
    })

    test('rejects invalid status', () => {
      const result = AlertUpdateSchema.safeParse({
        alert_id: 'alert_123',
        status: 'closed',
      })
      expect(result.success).toBe(false)
    })

    test('rejects missing alert_id', () => {
      const result = AlertUpdateSchema.safeParse({
        status: 'active',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('TaskCreateSchema', () => {
    test('accepts task with explicit todo status', () => {
      const result = TaskCreateSchema.safeParse({
        title: 'New task',
        status: 'todo',
      })
      expect(result.success).toBe(true)
    })

    test('defaults status to todo when not provided', () => {
      const result = TaskCreateSchema.safeParse({
        title: 'New task',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe('todo')
      }
    })

    test('rejects invalid status', () => {
      const result = TaskCreateSchema.safeParse({
        title: 'Task',
        status: 'blocked',
      })
      expect(result.success).toBe(false)
    })

    test('rejects empty title', () => {
      const result = TaskCreateSchema.safeParse({
        title: '',
      })
      expect(result.success).toBe(false)
    })

    test('rejects title over 500 chars', () => {
      const result = TaskCreateSchema.safeParse({
        title: 'x'.repeat(501),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('TaskUpdateSchema', () => {
    test('accepts partial update with id only', () => {
      const result = TaskUpdateSchema.safeParse({
        id: 'task_123',
      })
      expect(result.success).toBe(true)
    })

    test('accepts update with id and status', () => {
      const result = TaskUpdateSchema.safeParse({
        id: 'task_123',
        status: 'in-progress',
      })
      expect(result.success).toBe(true)
    })

    test('rejects invalid status in update', () => {
      const result = TaskUpdateSchema.safeParse({
        id: 'task_123',
        status: 'completed',
      })
      expect(result.success).toBe(false)
    })

    test('rejects missing id', () => {
      const result = TaskUpdateSchema.safeParse({
        status: 'done',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Security: SQL Injection Prevention', () => {
    test('rejects SQL injection in level field', () => {
      const result = AlertCreateSchema.safeParse({
        level: "info' OR '1'='1",
        component: 'api',
        message: 'test',
      })
      expect(result.success).toBe(false)
    })

    test('rejects SQL injection in status field', () => {
      const result = AlertUpdateSchema.safeParse({
        alert_id: 'alert_123',
        status: "active'; DROP TABLE alerts; --",
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Security: NoSQL Injection Prevention', () => {
    test('rejects object injection in status', () => {
      const result = TaskCreateSchema.safeParse({
        title: 'Task',
        status: { $ne: 'completed' } as any,
      })
      expect(result.success).toBe(false)
    })

    test('rejects regex injection', () => {
      const result = AlertLevelSchema.safeParse({ $regex: '.*' } as any)
      expect(result.success).toBe(false)
    })
  })

  describe('Security: Type Coercion Prevention', () => {
    test('rejects numeric type coercion', () => {
      expect(AlertLevelSchema.safeParse(1 as any).success).toBe(false)
    })

    test('rejects boolean type coercion', () => {
      expect(TaskStatusSchema.safeParse(false as any).success).toBe(false)
    })

    test('rejects array type coercion', () => {
      expect(AlertStatusSchema.safeParse(['active'] as any).success).toBe(false)
    })

    test('rejects object type coercion', () => {
      expect(MeetingStatusSchema.safeParse({ value: 'scheduled' } as any).success).toBe(false)
    })
  })

  describe('Helper Functions', () => {
    test('isValidEnumValue returns true for valid values', () => {
      expect(isValidEnumValue('info', ENUM_VALUES.AlertLevel)).toBe(true)
      expect(isValidEnumValue('active', ENUM_VALUES.AlertStatus)).toBe(true)
      expect(isValidEnumValue('todo', ENUM_VALUES.TaskStatus)).toBe(true)
    })

    test('isValidEnumValue returns false for invalid values', () => {
      expect(isValidEnumValue('debug', ENUM_VALUES.AlertLevel)).toBe(false)
      expect(isValidEnumValue(123, ENUM_VALUES.AlertLevel)).toBe(false)
      expect(isValidEnumValue(null, ENUM_VALUES.TaskStatus)).toBe(false)
    })
  })
})
