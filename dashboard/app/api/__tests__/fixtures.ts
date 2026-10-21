/**
 * Test Fixtures and Mocks
 *
 * Centralized fixtures for consistent test setup and teardown
 * Ensures proper mock isolation and test independence
 */

export const createMockCircuitBreaker = (failureThreshold = 3, successThreshold = 2, timeout = 100) => {
  let state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  let failureCount = 0
  let successCount = 0
  let lastFailureTime = 0

  return {
    async execute<T>(operation: () => Promise<T>): Promise<T> {
      if (state === 'OPEN') {
        const now = Date.now()
        if (now - lastFailureTime > timeout) {
          state = 'HALF_OPEN'
          successCount = 0
        } else {
          throw new Error('Circuit breaker is OPEN')
        }
      }

      try {
        const result = await operation()

        if (state === 'HALF_OPEN') {
          successCount++
          if (successCount >= successThreshold) {
            state = 'CLOSED'
            failureCount = 0
          }
        }

        return result
      } catch (error) {
        failureCount++
        lastFailureTime = Date.now()

        if (failureCount >= failureThreshold) {
          state = 'OPEN'
        }

        throw error
      }
    },

    getState() {
      return state
    },

    reset() {
      state = 'CLOSED'
      failureCount = 0
      successCount = 0
      lastFailureTime = 0
    },
  }
}

export const createMockApiResponse = <T>(data: T, statusCode = 200) => ({
  status: statusCode,
  data,
  headers: {
    'content-type': 'application/json',
  },
})

export const createMockError = (message: string, code: string) => {
  const error = new Error(message) as Error & { code?: string }
  error.code = code
  return error
}

export const mockValidUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
}

export const mockAdminUser = {
  id: 'admin-123',
  email: 'admin@example.com',
  name: 'Admin User',
  role: 'admin',
}

export const mockMeeting = {
  id: 'meeting-123',
  title: 'Test Meeting',
  description: 'A test meeting',
  startTime: new Date('2026-10-22T10:00:00Z'),
  endTime: new Date('2026-10-22T11:00:00Z'),
  attendees: ['user-123', 'user-456'],
}

export const mockAlert = {
  id: 'alert-123',
  title: 'Test Alert',
  message: 'This is a test alert',
  severity: 'high',
  timestamp: new Date(),
  read: false,
}

export const mockKanbanItem = {
  id: 'item-123',
  title: 'Task 1',
  description: 'First task',
  status: 'todo',
  priority: 'high',
  assignee: 'user-123',
}

/**
 * Creates a clean test context with isolated mocks
 * Use in beforeEach to ensure test independence
 */
export function createTestContext() {
  return {
    circuitBreaker: createMockCircuitBreaker(),
    mockUser: { ...mockValidUser },
    mockAdmin: { ...mockAdminUser },
    mockMeeting: { ...mockMeeting },
    mockAlert: { ...mockAlert },
    mockItem: { ...mockKanbanItem },

    /**
     * Clean up all mocks after test
     * Use in afterEach
     */
    cleanup() {
      // Reset all state
    },
  }
}

/**
 * Standard test data generators for edge case testing
 */
export const testDataGenerators = {
  nullValues: [null, undefined],

  emptyValues: ['', [], {}, 0, false],

  edgeCaseStrings: [
    '<script>alert(1)</script>',
    'javascript:alert(1)',
    '../../etc/passwd',
    "'; DROP TABLE users; --",
    '\x00\x01\x02',
    '\n\r\t',
  ],

  validEmails: ['user@example.com', 'test+tag@example.co.uk', 'name.surname@example.com'],

  invalidEmails: ['not-an-email', '@example.com', 'user@', 'user@.com', ''],

  validDates: [
    new Date('2026-10-22'),
    new Date('1970-01-01'),
    new Date('2099-12-31'),
  ],

  invalidDates: [new Date('invalid'), new Date('2026-13-45'), new Date(NaN)],

  largeValues: {
    longString: 'a'.repeat(10000),
    largeArray: Array.from({ length: 10000 }, (_, i) => i),
    largeObject: Array.from({ length: 1000 }, (_, i) => ({
      [i]: `value-${i}`,
    })).reduce((acc, obj) => ({ ...acc, ...obj }), {}),
  },

  boundaryNumbers: [0, 1, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER],
}
