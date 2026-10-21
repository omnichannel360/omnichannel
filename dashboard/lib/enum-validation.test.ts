import {
  AlertLevelSchema,
  AlertStatusSchema,
  AlertCreateSchema,
  AlertUpdateSchema,
  TaskCreateSchema,
  TaskUpdateSchema,
} from '@/lib/validation'
import { z } from 'zod'

/**
 * COMPREHENSIVE ENUM VALIDATION TEST SUITE
 * Tests all status/level enum fields across alerts and kanban APIs
 * Validates that invalid enum values are rejected at the schema level
 */

describe('Enum Validation - AlertLevelSchema', () => {
  it('accepts valid alert levels', () => {
    expect(AlertLevelSchema.safeParse('info').success).toBe(true)
    expect(AlertLevelSchema.safeParse('warning').success).toBe(true)
    expect(AlertLevelSchema.safeParse('critical').success).toBe(true)
  })

  it('rejects invalid alert levels', () => {
    const invalidLevels = ['debug', 'error', 'fatal', 'trace', 'INFO', 'Warning', '', 'severe', 'low', 'high']

    invalidLevels.forEach(level => {
      const result = AlertLevelSchema.safeParse(level)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('invalid_enum_value')
      }
    })
  })

  it('rejects non-string alert levels', () => {
    expect(AlertLevelSchema.safeParse(123).success).toBe(false)
    expect(AlertLevelSchema.safeParse(null).success).toBe(false)
    expect(AlertLevelSchema.safeParse(undefined).success).toBe(false)
    expect(AlertLevelSchema.safeParse({ level: 'info' }).success).toBe(false)
    expect(AlertLevelSchema.safeParse(['info']).success).toBe(false)
  })
})

describe('Enum Validation - AlertStatusSchema', () => {
  it('accepts valid alert statuses', () => {
    expect(AlertStatusSchema.safeParse('active').success).toBe(true)
    expect(AlertStatusSchema.safeParse('resolved').success).toBe(true)
  })

  it('rejects invalid alert statuses', () => {
    const invalidStatuses = ['pending', 'archived', 'deleted', 'in_review', 'inactive', 'ACTIVE', 'Resolved', '', 'new', 'closed']

    invalidStatuses.forEach(status => {
      const result = AlertStatusSchema.safeParse(status)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('invalid_enum_value')
      }
    })
  })

  it('rejects non-string alert statuses', () => {
    expect(AlertStatusSchema.safeParse(123).success).toBe(false)
    expect(AlertStatusSchema.safeParse(null).success).toBe(false)
    expect(AlertStatusSchema.safeParse(undefined).success).toBe(false)
    expect(AlertStatusSchema.safeParse(true).success).toBe(false)
  })
})

describe('Enum Validation - AlertCreateSchema', () => {
  it('accepts valid alert creation with valid level enum', () => {
    const validAlerts = [
      { level: 'info', component: 'auth', message: 'login attempt' },
      { level: 'warning', component: 'db', message: 'slow query' },
      { level: 'critical', component: 'api', message: 'service down' },
    ]

    validAlerts.forEach(alert => {
      expect(AlertCreateSchema.safeParse(alert).success).toBe(true)
    })
  })

  it('rejects alert creation with invalid level enum', () => {
    const invalidAlerts = [
      { level: 'error', component: 'auth', message: 'test' },
      { level: 'debug', component: 'db', message: 'test' },
      { level: 'INFO', component: 'api', message: 'test' },
      { level: '', component: 'auth', message: 'test' },
      { level: null, component: 'auth', message: 'test' },
      { level: 123, component: 'auth', message: 'test' },
    ]

    invalidAlerts.forEach(alert => {
      const result = AlertCreateSchema.safeParse(alert)
      expect(result.success).toBe(false)
    })
  })

  it('rejects incomplete alert creation', () => {
    expect(AlertCreateSchema.safeParse({ level: 'info' }).success).toBe(false)
    expect(AlertCreateSchema.safeParse({ component: 'auth' }).success).toBe(false)
    expect(AlertCreateSchema.safeParse({}).success).toBe(false)
  })
})

describe('Enum Validation - AlertUpdateSchema', () => {
  it('accepts valid alert update with valid status enum', () => {
    const validUpdates = [
      { alert_id: 'alert_123', status: 'active' },
      { alert_id: 'alert_456', status: 'resolved' },
    ]

    validUpdates.forEach(update => {
      expect(AlertUpdateSchema.safeParse(update).success).toBe(true)
    })
  })

  it('rejects alert update with invalid status enum', () => {
    const invalidUpdates = [
      { alert_id: 'alert_123', status: 'pending' },
      { alert_id: 'alert_123', status: 'archived' },
      { alert_id: 'alert_123', status: 'ACTIVE' },
      { alert_id: 'alert_123', status: '' },
      { alert_id: 'alert_123', status: null },
      { alert_id: 'alert_123', status: 123 },
    ]

    invalidUpdates.forEach(update => {
      const result = AlertUpdateSchema.safeParse(update)
      expect(result.success).toBe(false)
    })
  })
})

describe('Enum Validation - TaskCreateSchema', () => {
  it('accepts valid task creation with valid status enum', () => {
    const validTasks = [
      { title: 'Task 1', status: 'todo' },
      { title: 'Task 2', status: 'in-progress' },
      { title: 'Task 3', status: 'done' },
      { title: 'Task 4' }, // status defaults to 'todo'
    ]

    validTasks.forEach(task => {
      const result = TaskCreateSchema.safeParse(task)
      expect(result.success).toBe(true)
      if (result.success && !task.status) {
        expect(result.data.status).toBe('todo')
      }
    })
  })

  it('rejects task creation with invalid status enum', () => {
    const invalidTasks = [
      { title: 'Task 1', status: 'completed' },
      { title: 'Task 2', status: 'pending' },
      { title: 'Task 3', status: 'in_progress' }, // hyphen required
      { title: 'Task 4', status: 'TODO' },
      { title: 'Task 5', status: '' },
      { title: 'Task 6', status: null },
      { title: 'Task 7', status: 123 },
    ]

    invalidTasks.forEach(task => {
      const result = TaskCreateSchema.safeParse(task)
      expect(result.success).toBe(false)
    })
  })

  it('requires title and rejects with invalid status', () => {
    expect(TaskCreateSchema.safeParse({}).success).toBe(false)
    expect(TaskCreateSchema.safeParse({ status: 'todo' }).success).toBe(false)
  })
})

describe('Enum Validation - TaskUpdateSchema', () => {
  it('accepts valid task update with valid status enum', () => {
    const validUpdates = [
      { id: 'task_1', status: 'todo' },
      { id: 'task_2', status: 'in-progress' },
      { id: 'task_3', status: 'done' },
      { id: 'task_4', title: 'Updated', status: 'in-progress' },
      { id: 'task_5', title: 'Updated' }, // status is optional
    ]

    validUpdates.forEach(update => {
      expect(TaskUpdateSchema.safeParse(update).success).toBe(true)
    })
  })

  it('rejects task update with invalid status enum', () => {
    const invalidUpdates = [
      { id: 'task_1', status: 'completed' },
      { id: 'task_2', status: 'pending' },
      { id: 'task_3', status: 'in_progress' },
      { id: 'task_4', status: 'TODO' },
      { id: 'task_5', status: '' },
      { id: 'task_6', status: null },
      { id: 'task_7', status: 123 },
    ]

    invalidUpdates.forEach(update => {
      const result = TaskUpdateSchema.safeParse(update)
      expect(result.success).toBe(false)
    })
  })

  it('rejects update without ID', () => {
    expect(TaskUpdateSchema.safeParse({ status: 'done' }).success).toBe(false)
  })
})

describe('Enum Validation - Edge Cases', () => {
  it('rejects whitespace-padded enum values', () => {
    expect(AlertLevelSchema.safeParse(' info ').success).toBe(false)
    expect(AlertStatusSchema.safeParse(' active ').success).toBe(false)
    expect(TaskCreateSchema.safeParse({ title: 'Task', status: ' todo ' }).success).toBe(false)
  })

  it('rejects partial enum matches', () => {
    expect(AlertLevelSchema.safeParse('inf').success).toBe(false)
    expect(AlertLevelSchema.safeParse('information').success).toBe(false)
    expect(AlertStatusSchema.safeParse('act').success).toBe(false)
  })

  it('preserves error details for diagnostics', () => {
    const result = AlertCreateSchema.safeParse({ level: 'invalid', component: 'test', message: 'test' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const flattened = result.error.flatten()
      expect(flattened.fieldErrors.level).toBeDefined()
    }
  })

  it('handles deeply nested invalid enum values', () => {
    const result = TaskUpdateSchema.safeParse({
      id: 'task_1',
      title: 'Test',
      status: { nested: 'invalid' },
    })
    expect(result.success).toBe(false)
  })
})

describe('Enum Validation - Type Safety', () => {
  it('correctly infers types from valid AlertCreateSchema', () => {
    const result = AlertCreateSchema.safeParse({
      level: 'info',
      component: 'auth',
      message: 'test',
    })

    if (result.success) {
      type AlertType = z.infer<typeof AlertCreateSchema>
      const alert: AlertType = result.data
      expect(['info', 'warning', 'critical']).toContain(alert.level)
    }
  })

  it('correctly infers types from valid TaskCreateSchema', () => {
    const result = TaskCreateSchema.safeParse({
      title: 'Test Task',
      status: 'in-progress',
    })

    if (result.success) {
      type TaskType = z.infer<typeof TaskCreateSchema>
      const task: TaskType = result.data
      expect(['todo', 'in-progress', 'done']).toContain(task.status)
    }
  })
})
