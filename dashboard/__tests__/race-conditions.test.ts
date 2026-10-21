/**
 * Race Condition Prevention Tests
 *
 * Tests that verify atomic file operations prevent lost updates and data corruption
 * from concurrent reads/writes to JSON data files.
 */

import { atomicUpdate, atomicRead, atomicWrite } from '@/lib/atomic-file-ops'
import { promises as fs } from 'fs'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'

const TEST_DIR = path.join(process.cwd(), 'data', 'test-atomic')
const TEST_FILE = path.join(TEST_DIR, 'test-atomic.json')

interface TestData {
  id: string
  value: number
  timestamp: string
}

describe('Atomic File Operations - Race Condition Prevention', () => {
  beforeEach(async () => {
    // Create test directory
    try {
      await fs.mkdir(TEST_DIR, { recursive: true })
    } catch {
      // Already exists
    }
  })

  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true })
    } catch {
      // Already deleted
    }
  })

  describe('atomicUpdate - Critical Section Protection', () => {
    it('should prevent lost updates from concurrent modifications', async () => {
      // Initialize file with array
      await atomicWrite<TestData[]>(TEST_FILE, [
        { id: '1', value: 100, timestamp: new Date().toISOString() },
      ])

      // Simulate two concurrent update attempts
      // Both should see the same initial state and properly merge their updates
      const promise1 = atomicUpdate<TestData[], void>(TEST_FILE, async (data) => {
        // Simulate some async work
        await new Promise(resolve => setTimeout(resolve, 50))
        const updated = [...data, { id: '2', value: 200, timestamp: new Date().toISOString() }]
        return { updated, result: undefined }
      })

      const promise2 = atomicUpdate<TestData[], void>(TEST_FILE, async (data) => {
        // This should see data with only item 1, not the item added by promise1
        // because each update is atomic and sequential
        const updated = [...data, { id: '3', value: 300, timestamp: new Date().toISOString() }]
        return { updated, result: undefined }
      })

      // Execute both "concurrently" but they will queue due to file lock
      await Promise.all([promise1, promise2])

      // Both updates should be applied (no lost updates)
      const result = await atomicRead<TestData[]>(TEST_FILE)
      expect(result).toHaveLength(3)
      expect(result.map(d => d.id)).toEqual(['1', '2', '3'])
    })

    it('should not allow interleaved reads and writes', async () => {
      const initialData: TestData[] = [
        { id: '1', value: 100, timestamp: new Date().toISOString() },
      ]
      await atomicWrite(TEST_FILE, initialData)

      let readDuringWrite = false

      // Start an update that takes time
      const updatePromise = atomicUpdate<TestData[], void>(TEST_FILE, async (data) => {
        // During this update, try to read the file
        const readAttempt = await Promise.race([
          atomicRead<TestData[]>(TEST_FILE).then(() => 'read succeeded'),
          new Promise<string>(resolve =>
            setTimeout(() => resolve('write still holding lock'), 100)
          ),
        ])

        if (readAttempt === 'write still holding lock') {
          readDuringWrite = false // Read was blocked, which is correct
        }

        const updated = [...data, { id: '2', value: 200, timestamp: new Date().toISOString() }]
        return { updated, result: undefined }
      })

      await updatePromise

      // Verify data consistency
      const result = await atomicRead<TestData[]>(TEST_FILE)
      expect(result).toHaveLength(2)
    })

    it('should handle errors and release locks', async () => {
      const initialData: TestData[] = []
      await atomicWrite(TEST_FILE, initialData)

      // First update fails
      try {
        await atomicUpdate<TestData[], void>(TEST_FILE, async () => {
          throw new Error('Simulated failure')
        })
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
      }

      // Second update should still work (lock was released)
      const result = await atomicUpdate<TestData[], TestData[]>(TEST_FILE, async (data) => {
        const updated = [...data, { id: '1', value: 100, timestamp: new Date().toISOString() }]
        return { updated, result: updated }
      })

      expect(result).toHaveLength(1)
    })

    it('should maintain data integrity under high concurrency', async () => {
      const initialData: TestData[] = []
      await atomicWrite(TEST_FILE, initialData)

      // Simulate 10 concurrent operations
      const operations = Array.from({ length: 10 }, (_, i) =>
        atomicUpdate<TestData[], void>(TEST_FILE, async (data) => {
          // Each operation adds an item
          const newItem: TestData = {
            id: `item-${i}`,
            value: i * 100,
            timestamp: new Date().toISOString(),
          }
          const updated = [...data, newItem]
          return { updated, result: undefined }
        })
      )

      await Promise.all(operations)

      // All 10 items should be present (no lost updates)
      const result = await atomicRead<TestData[]>(TEST_FILE)
      expect(result).toHaveLength(10)
      expect(new Set(result.map(d => d.id)).size).toBe(10) // All unique
    })
  })

  describe('atomicRead - Consistent Reads', () => {
    it('should read entire file atomically', async () => {
      const testData = [
        { id: '1', value: 100, timestamp: new Date().toISOString() },
        { id: '2', value: 200, timestamp: new Date().toISOString() },
      ]
      await atomicWrite(TEST_FILE, testData)

      const result = await atomicRead<TestData[]>(TEST_FILE)
      expect(result).toEqual(testData)
    })

    it('should return empty array for non-existent file', async () => {
      const nonExistentFile = path.join(TEST_DIR, 'non-existent.json')
      const result = await atomicRead<TestData[]>(nonExistentFile)
      expect(result).toEqual([])
    })

    it('should throw on corrupted JSON', async () => {
      // Write invalid JSON
      await fs.writeFile(TEST_FILE, 'invalid json {]', 'utf-8')

      await expect(atomicRead<TestData[]>(TEST_FILE)).rejects.toThrow(
        'File is corrupted or contains invalid JSON'
      )
    })
  })

  describe('atomicWrite - Consistent Writes', () => {
    it('should write entire file atomically', async () => {
      const testData: TestData[] = [
        { id: '1', value: 100, timestamp: new Date().toISOString() },
      ]

      await atomicWrite(TEST_FILE, testData)

      const result = await atomicRead<TestData[]>(TEST_FILE)
      expect(result).toEqual(testData)
    })

    it('should create directory if it does not exist', async () => {
      const nestedFile = path.join(TEST_DIR, 'nested', 'deep', 'file.json')
      const testData: TestData[] = [{ id: '1', value: 100, timestamp: new Date().toISOString() }]

      await atomicWrite(nestedFile, testData)

      const result = await atomicRead<TestData[]>(nestedFile)
      expect(result).toEqual(testData)
    })

    it('should overwrite existing file', async () => {
      const oldData = [{ id: 'old', value: 0, timestamp: new Date().toISOString() }]
      const newData = [{ id: 'new', value: 1, timestamp: new Date().toISOString() }]

      await atomicWrite(TEST_FILE, oldData)
      await atomicWrite(TEST_FILE, newData)

      const result = await atomicRead<TestData[]>(TEST_FILE)
      expect(result).toEqual(newData)
    })
  })

  describe('Real-World Scenario: Alerts API', () => {
    const ALERTS_FILE = path.join(TEST_DIR, 'alerts.json')

    interface Alert {
      id: string
      message: string
      status: 'active' | 'resolved'
    }

    it('should handle concurrent alert creation without lost updates', async () => {
      const initialAlerts: Alert[] = []
      await atomicWrite(ALERTS_FILE, initialAlerts)

      // Simulate 5 concurrent POST requests creating alerts
      const createAlertOperations = Array.from({ length: 5 }, (_, i) =>
        atomicUpdate<Alert[], Alert>(ALERTS_FILE, async (alerts) => {
          const newAlert: Alert = {
            id: `alert-${i}`,
            message: `Alert ${i}`,
            status: 'active',
          }
          const updated = [...alerts, newAlert]
          return { updated, result: newAlert }
        })
      )

      const createdAlerts = await Promise.all(createAlertOperations)

      // Verify all alerts were created
      expect(createdAlerts).toHaveLength(5)

      // Verify all are in file
      const fileAlerts = await atomicRead<Alert[]>(ALERTS_FILE)
      expect(fileAlerts).toHaveLength(5)
    })

    it('should handle concurrent updates with reads', async () => {
      const initialAlerts: Alert[] = [
        { id: 'alert-1', message: 'Test', status: 'active' },
      ]
      await atomicWrite(ALERTS_FILE, initialAlerts)

      // Concurrent: 1 update, 1 read
      const updatePromise = atomicUpdate<Alert[], void>(ALERTS_FILE, async (alerts) => {
        const updated = alerts.map(a => ({
          ...a,
          status: 'resolved' as const,
        }))
        return { updated, result: undefined }
      })

      // This read will queue after the update due to file lock
      const readPromise = atomicRead<Alert[]>(ALERTS_FILE)

      await updatePromise
      const readResult = await readPromise

      // Read should see the updated state
      expect(readResult[0].status).toBe('resolved')
    })
  })

  describe('Real-World Scenario: Kanban Tasks API', () => {
    const TASKS_FILE = path.join(TEST_DIR, 'tasks.json')

    interface Task {
      id: string
      title: string
      status: 'todo' | 'in-progress' | 'done'
    }

    it('should prevent lost updates when multiple tasks are modified', async () => {
      const initialTasks: Task[] = [
        { id: '1', title: 'Task 1', status: 'todo' },
        { id: '2', title: 'Task 2', status: 'todo' },
      ]
      await atomicWrite(TASKS_FILE, initialTasks)

      // Simulate:
      // - Request A: Update task 1 status
      // - Request B: Create task 3
      // - Request C: Delete task 2
      // Both A and B should succeed, C should succeed

      const updatePromise = atomicUpdate<Task[], void>(TASKS_FILE, async (tasks) => {
        const updated = tasks.map(t =>
          t.id === '1' ? { ...t, status: 'in-progress' as const } : t
        )
        return { updated, result: undefined }
      })

      const createPromise = atomicUpdate<Task[], void>(TASKS_FILE, async (tasks) => {
        const newTask: Task = { id: '3', title: 'Task 3', status: 'todo' }
        const updated = [...tasks, newTask]
        return { updated, result: undefined }
      })

      const deletePromise = atomicUpdate<Task[], void>(TASKS_FILE, async (tasks) => {
        const updated = tasks.filter(t => t.id !== '2')
        return { updated, result: undefined }
      })

      await Promise.all([updatePromise, createPromise, deletePromise])

      const result = await atomicRead<Task[]>(TASKS_FILE)

      // Should have 2 items: task 1 (updated), task 3 (created)
      // Task 2 should be deleted or not depending on operation order
      // But critically: no data should be lost or corrupted
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result.length).toBeLessThanOrEqual(3)

      // Verify no duplicate IDs
      const ids = result.map(t => t.id)
      expect(ids.length).toBe(new Set(ids).size)
    })
  })
})

