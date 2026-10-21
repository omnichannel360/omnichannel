import {
  AlertLevelSchema,
  AlertStatusSchema,
  TaskStatusSchema,
  MeetingStatusSchema,
  AlertCreateSchema,
  AlertUpdateSchema,
  TaskCreateSchema,
  TaskUpdateSchema,
} from '@/lib/validation'
import { z } from 'zod'

/**
 * Comprehensive Enum Validation Tests
 * Ensures all status/level fields reject invalid values
 * Test Coverage: Alerts (level, status), Kanban Tasks (status), Meetings (status)
 */

describe('Enum Validation - Alert Level', () => {
  const validLevels = ['info', 'warning', 'critical']
  const invalidLevels = [
    'debug',
    'error',
    'fatal',
    'trace',
    'INFO',
    'WARNING',
    'CRITICAL',
    '',
    'random',
    123,
    null,
    undefined,
    { level: 'info' },
    ['info'],
  ]

  validLevels.forEach(level => {
    test(`accepts valid level: "${level}"`, () => {
      const result = AlertLevelSchema.safeParse(level)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(level)
      }
    })
  })

  invalidLevels.forEach(level => {
    test(`rejects invalid level: ${JSON.stringify(level)}`, () => {
      const result = AlertLevelSchema.safeParse(level)
      expect(result.success).toBe(false)
    })
  })

  test('enum schema type safety', () => {
    const schema = AlertLevelSchema
    expect(schema.options || schema._def).toBeDefined()
  })
})

describe('Enum Validation - Alert Status', () => {
  const validStatuses = ['active', 'resolved']
  const invalidStatuses = [
    'inactive',
    'pending',
    'closed',
    'archived',
    'deleted',
    'ACTIVE',
    'RESOLVED',
    '',
    'active ',
    ' active',
    123,
    null,
    undefined,
    { status: 'active' },
    ['active'],
  ]

  validStatuses.forEach(status => {
    test(`accepts valid status: "${status}"`, () => {
      const result = AlertStatusSchema.safeParse(status)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(status)
      }
    })
  })

  invalidStatuses.forEach(status => {
    test(`rejects invalid status: ${JSON.stringify(status)}`, () => {
      const result = AlertStatusSchema.safeParse(status)
      expect(result.success).toBe(false)
    })
  })
})

describe('Enum Validation - Task Status', () => {
  const validStatuses = ['todo', 'in-progress', 'done']
  const invalidStatuses = [
    'completed',
    'pending',
    'blocked',
    'review',
    'archived',
    'TODO',
    'IN-PROGRESS',
    'DONE',
    'in_progress',
    'inprogress',
    '',
    123,
    null,
    undefined,
    { status: 'todo' },
    ['todo'],
  ]

  validStatuses.forEach(status => {
    test(`accepts valid task status: "${status}"`, () => {
      const result = TaskStatusSchema.safeParse(status)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(status)
      }
    })
  })

  invalidStatuses.forEach(status => {
    test(`rejects invalid task status: ${JSON.stringify(status)}`, () => {
      const result = TaskStatusSchema.safeParse(status)
      expect(result.success).toBe(false)
    })
  })
})

describe('Enum Validation - Meeting Status', () => {
  const validStatuses = ['scheduled', 'completed', 'failed']
  const invalidStatuses = [
    'pending',
    'cancelled',
    'in-progress',
    'SCHEDULED',
    'COMPLETED',
    'FAILED',
    '',
    123,
    null,
    undefined,
  ]

  validStatuses.forEach(status => {
    test(`accepts valid meeting status: "${status}"`, () => {
      const result = MeetingStatusSchema.safeParse(status)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(status)
      }
    })
  })

  invalidStatuses.forEach(status => {
    test(`rejects invalid meeting status: ${JSON.stringify(status)}`, () => {
      const result = MeetingStatusSchema.safeParse(status)
      expect(result.success).toBe(false)
    })
  })
})

describe('Alert Create Schema - Full Validation', () => {
  test('accepts valid alert creation request', () => {
    const validRequest = {
      level: 'critical',
      component: 'database',
      message: 'Connection timeout detected',
    }
    const result = AlertCreateSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
  })

  test('rejects request with invalid level', () => {
    const invalidRequest = {
      level: 'debug',
      component: 'database',
      message: 'Connection timeout',
    }
    const result = AlertCreateSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.level).toBeDefined()
    }
  })

  test('rejects request with missing level', () => {
    const invalidRequest = {
      component: 'database',
      message: 'Connection timeout',
    }
    const result = AlertCreateSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
  })

  test('rejects request with empty message', () => {
    const invalidRequest = {
      level: 'info',
      component: 'test',
      message: '',
    }
    const result = AlertCreateSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
  })

  test('rejects request with message exceeding max length', () => {
    const invalidRequest = {
      level: 'warning',
      component: 'api',
      message: 'x'.repeat(2001),
    }
    const result = AlertCreateSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
  })

  test('rejects request with malicious enum injection', () => {
    const maliciousRequest = {
      level: 'info" OR "1"="1',
      component: 'db',
      message: 'test',
    }
    const result = AlertCreateSchema.safeParse(maliciousRequest)
    expect(result.success).toBe(false)
  })
})

describe('Alert Update Schema - Full Validation', () => {
  test('accepts valid alert update request', () => {
    const validRequest = {
      alert_id: 'alert_550e8400-e29b-41d4-a716-446655440000',
      status: 'resolved',
    }
    const result = AlertUpdateSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
  })

  test('rejects request with invalid status', () => {
    const invalidRequest = {
      alert_id: 'alert_123',
      status: 'archived',
    }
    const result = AlertUpdateSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.status).toBeDefined()
    }
  })

  test('rejects request with missing alert_id', () => {
    const invalidRequest = {
      status: 'resolved',
    }
    const result = AlertUpdateSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
  })

  test('rejects request with null status', () => {
    const invalidRequest = {
      alert_id: 'alert_123',
      status: null,
    }
    const result = AlertUpdateSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
  })

  test('rejects update attempting type confusion', () => {
    const maliciousRequest = {
      alert_id: 'alert_123',
      status: 123 as any,
    }
    const result = AlertUpdateSchema.safeParse(maliciousRequest)
    expect(result.success).toBe(false)
  })
})

describe('Task Create Schema - Full Validation', () => {
  test('accepts valid task creation request', () => {
    const validRequest = {
      title: 'Implement enum validation',
      status: 'in-progress',
    }
    const result = TaskCreateSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
  })

  test('accepts request with default status', () => {
    const validRequest = {
      title: 'New task',
    }
    const result = TaskCreateSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('todo')
    }
  })

  test('rejects request with invalid status', () => {
    const invalidRequest = {
      title: 'Task',
      status: 'completed',
    }
    const result = TaskCreateSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
  })

  test('rejects request with empty title', () => {
    const invalidRequest = {
      title: '',
      status: 'todo',
    }
    const result = TaskCreateSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
  })

  test('rejects request with title exceeding max length', () => {
    const invalidRequest = {
      title: 'x'.repeat(501),
      status: 'todo',
    }
    const result = TaskCreateSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
  })
})

describe('Task Update Schema - Full Validation', () => {
  test('accepts valid task update request', () => {
    const validRequest = {
      id: 'task_123',
      title: 'Updated task',
      status: 'done',
    }
    const result = TaskUpdateSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
  })

  test('accepts partial update (status only)', () => {
    const validRequest = {
      id: 'task_123',
      status: 'in-progress',
    }
    const result = TaskUpdateSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
  })

  test('rejects request with invalid status', () => {
    const invalidRequest = {
      id: 'task_123',
      status: 'blocked',
    }
    const result = TaskUpdateSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
  })

  test('rejects request with missing id', () => {
    const invalidRequest = {
      title: 'Updated',
      status: 'done',
    }
    const result = TaskUpdateSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
  })

  test('rejects update with empty title', () => {
    const invalidRequest = {
      id: 'task_123',
      title: '',
    }
    const result = TaskUpdateSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
  })

  test('allows undefined fields for partial updates', () => {
    const validRequest = {
      id: 'task_123',
      title: undefined,
      status: undefined,
    }
    const result = TaskUpdateSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
  })
})

describe('Enum Validation - Security Edge Cases', () => {
  test('prevents prototype pollution via enum values', () => {
    const malicious = {
      __proto__: { isAdmin: true },
      level: 'info',
      component: 'test',
      message: 'test',
    }
    const result = AlertCreateSchema.safeParse(malicious)
    expect(result.success).toBe(true)
    // Verify __proto__ is not in parsed data
    if (result.success) {
      expect(result.data).not.toHaveProperty('__proto__')
    }
  })

  test('prevents enum value mutation', () => {
    const validLevel = 'critical'
    const result = AlertLevelSchema.safeParse(validLevel)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(typeof result.data).toBe('string')
      expect(result.data).toBe('critical')
    }
  })

  test('prevents constructor-based injection', () => {
    const maliciousStatus = {
      constructor: { prototype: { isAdmin: true } },
      toString: () => 'active',
    } as any
    const result = AlertStatusSchema.safeParse(maliciousStatus)
    expect(result.success).toBe(false)
  })

  test('preserves exact enum values (no trimming)', () => {
    const testCases = [
      { input: 'active ', expected: false },
      { input: ' active', expected: false },
      { input: 'active', expected: true },
    ]

    testCases.forEach(({ input, expected }) => {
      const result = AlertStatusSchema.safeParse(input)
      expect(result.success).toBe(expected)
    })
  })
})

describe('Enum Validation - Type Coercion Prevention', () => {
  test('rejects number coercion to enum', () => {
    const numericInput = 1 as any
    const result = AlertLevelSchema.safeParse(numericInput)
    expect(result.success).toBe(false)
  })

  test('rejects boolean coercion to enum', () => {
    const booleanInput = true as any
    const result = AlertStatusSchema.safeParse(booleanInput)
    expect(result.success).toBe(false)
  })

  test('rejects object string representation', () => {
    const objectInput = {
      toString: () => 'info',
    } as any
    const result = AlertLevelSchema.safeParse(objectInput)
    expect(result.success).toBe(false)
  })

  test('rejects array toString coercion', () => {
    const arrayInput = ['info'] as any
    const result = AlertLevelSchema.safeParse(arrayInput)
    expect(result.success).toBe(false)
  })
})
