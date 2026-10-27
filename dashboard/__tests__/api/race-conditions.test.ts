/**
 * Race Condition Test Suite
 * Tests atomic operations across all file-based APIs
 * Ensures data integrity under concurrent load
 *
 * Every test runs in its own fresh temp dir (never dashboard/data).
 */

import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'
import { atomicUpdate, atomicRead, atomicWrite } from '@/lib/atomic-file-ops'
import { clearAllLocks, getLockCount } from '@/lib/file-lock'

interface TestAlert {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'critical'
  component: string
  message: string
  status: 'active' | 'resolved'
}

interface TestTask {
  id: string
  title: string
  status: 'todo' | 'in-progress' | 'done'
}

describe('Race Condition Tests', () => {
  let testDir: string
  let alertsFile: string
  let tasksFile: string

  beforeEach(async () => {
    clearAllLocks()
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-test-'))
    alertsFile = path.join(testDir, 'alerts.json')
    tasksFile = path.join(testDir, 'tasks.json')
  })

  afterEach(async () => {
    clearAllLocks()
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('Concurrent Operations', () => {
    it('POST alerts concurrently - 10 operations', async () => {
      const concurrency = 10
      const promises: Promise<TestAlert[]>[] = []

      for (let i = 0; i < concurrency; i++) {
        promises.push(
          atomicUpdate<TestAlert[]>(
            alertsFile,
            async (alerts) => {
              const newAlert: TestAlert = {
                id: `alert-${i}`,
                timestamp: new Date().toISOString(),
                level: 'warning',
                component: `component-${i}`,
                message: `Concurrent alert ${i}`,
                status: 'active',
              }
              return [...alerts, newAlert]
            },
            []
          )
        )
      }

      const results = await Promise.all(promises)
      const final = await atomicRead<TestAlert[]>(alertsFile)

      expect(final.length).toBe(concurrency)
      expect(results).toHaveLength(concurrency)
      const ids = new Set(final.map(a => a.id))
      expect(ids.size).toBe(concurrency)
    })

    it('PUT tasks concurrently - modify operations', async () => {
      const initialTasks: TestTask[] = Array.from({ length: 5 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        status: 'todo' as const,
      }))

      await atomicWrite<TestTask[]>(tasksFile, initialTasks)

      const modifyPromises: Promise<TestTask[]>[] = []

      for (let i = 0; i < 10; i++) {
        modifyPromises.push(
          atomicUpdate<TestTask[]>(
            tasksFile,
            async (tasks) => {
              const taskIndex = tasks.findIndex(t => t.id === `task-${i % 5}`)

              if (taskIndex === -1) {
                throw new Error('Task not found')
              }

              const updated = { ...tasks[taskIndex], status: 'in-progress' as const }
              return [...tasks.slice(0, taskIndex), updated, ...tasks.slice(taskIndex + 1)]
            },
            []
          )
        )
      }

      const results = await Promise.all(modifyPromises)
      expect(results).toHaveLength(10)

      const final = await atomicRead<TestTask[]>(tasksFile)
      expect(final.length).toBe(5)
      expect(final.every(t => t.status === 'in-progress')).toBe(true)
    })

    it('prevent lost update anomaly - increment counter', async () => {
      const file = path.join(testDir, 'counter.json')

      interface Counter {
        count: number
      }

      await atomicWrite<Counter>(file, { count: 0 })

      const promises = Array.from({ length: 10 }, () =>
        atomicUpdate<Counter>(file, async (data) => ({ count: data.count + 1 }), { count: 0 })
      )

      await Promise.all(promises)
      const final = await atomicRead<Counter>(file)

      expect(final.count).toBe(10)
    })

    it('DELETE operations concurrently', async () => {
      const tasks: TestTask[] = [
        { id: 'task-1', title: 'Task 1', status: 'todo' },
        { id: 'task-2', title: 'Task 2', status: 'todo' },
        { id: 'task-3', title: 'Task 3', status: 'todo' },
      ]

      await atomicWrite<TestTask[]>(tasksFile, tasks)

      await Promise.all([
        atomicUpdate<TestTask[]>(tasksFile, async (current) => current.filter(t => t.id !== 'task-1'), []),
        atomicUpdate<TestTask[]>(tasksFile, async (current) => current.filter(t => t.id !== 'task-2'), []),
      ])

      const final = await atomicRead<TestTask[]>(tasksFile)
      expect(final.length).toBe(1)
      expect(final[0].id).toBe('task-3')
    })

    it('high concurrency stress test - 50 concurrent writes', async () => {
      const concurrency = 50
      const promises: Promise<TestAlert[]>[] = []

      for (let i = 0; i < concurrency; i++) {
        promises.push(
          atomicUpdate<TestAlert[]>(
            alertsFile,
            async (alerts) => {
              const alert: TestAlert = {
                id: `alert-${i}`,
                timestamp: new Date().toISOString(),
                level: 'info',
                component: 'test',
                message: `Alert ${i}`,
                status: 'active',
              }
              return [...alerts, alert]
            },
            []
          )
        )
      }

      await Promise.all(promises)
      const final = await atomicRead<TestAlert[]>(alertsFile)

      expect(final.length).toBe(concurrency)
      const ids = new Set(final.map(a => a.id))
      expect(ids.size).toBe(concurrency)
      expect(final.every(a => a.id && a.timestamp)).toBe(true)
    })

    it('extreme stress test - 100 concurrent operations', async () => {
      const concurrency = 100
      const promises: Promise<TestTask[]>[] = []

      for (let i = 0; i < concurrency; i++) {
        promises.push(
          atomicUpdate<TestTask[]>(
            tasksFile,
            async (tasks) => {
              const task: TestTask = {
                id: `task-${i}`,
                title: `Task ${i}`,
                status: 'todo',
              }
              return [...tasks, task]
            },
            []
          )
        )
      }

      const results = await Promise.all(promises)
      expect(results).toHaveLength(concurrency)

      const final = await atomicRead<TestTask[]>(tasksFile)
      expect(final.length).toBe(concurrency)

      // Verify no duplicates
      const ids = new Set(final.map(t => t.id))
      expect(ids.size).toBe(concurrency)
    }, 30000) // 100 serialized read+write cycles; Windows temp-dir I/O is slow

    it('mixed concurrent operations - reads and writes', async () => {
      const writeFile = path.join(testDir, 'mixed-ops.json')
      const initialData: TestTask[] = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        status: 'todo' as const,
      }))

      await atomicWrite<TestTask[]>(writeFile, initialData)

      const operations: Promise<unknown>[] = []

      // 20 read operations
      for (let i = 0; i < 20; i++) {
        operations.push(atomicRead<TestTask[]>(writeFile))
      }

      // 20 write operations
      for (let i = 0; i < 20; i++) {
        operations.push(
          atomicUpdate<TestTask[]>(
            writeFile,
            async (tasks) => {
              const newTask: TestTask = {
                id: `new-task-${i}`,
                title: `New Task ${i}`,
                status: 'in-progress',
              }
              return [...tasks, newTask]
            },
            []
          )
        )
      }

      await Promise.all(operations)
      const final = await atomicRead<TestTask[]>(writeFile)

      expect(final.length).toBe(30) // 10 original + 20 new
    })

    it('error handling - one operation fails, others succeed', async () => {
      const errorFile = path.join(testDir, 'error-handling.json')
      const promises: Promise<string | null>[] = []

      // Mix of successful and failing operations
      for (let i = 0; i < 10; i++) {
        promises.push(
          atomicUpdate<TestTask[]>(
            errorFile,
            async (tasks) => {
              // Every 3rd operation fails
              if (i % 3 === 0) {
                throw new Error(`Intentional error at operation ${i}`)
              }

              const task: TestTask = {
                id: `task-${i}`,
                title: `Task ${i}`,
                status: 'todo',
              }
              return [...tasks, task]
            },
            []
          )
            .then(() => 'success')
            .catch(() => null)
        )
      }

      const results = await Promise.all(promises)

      // Count successes and failures
      const successes = results.filter(r => r === 'success').length
      const failures = results.filter(r => r === null).length

      expect(successes + failures).toBe(10)
      expect(failures).toBeGreaterThan(0)

      // Verify the file only contains successful writes
      const final = await atomicRead<TestTask[]>(errorFile)
      expect(final.length).toBeLessThanOrEqual(10)
      expect(final.length).toBe(successes)
      expect(getLockCount()).toBe(0)
    })

    it('rapid fire writes - 30 operations in quick succession', async () => {
      const rapidFile = path.join(testDir, 'rapid-writes.json')
      const promises: Promise<TestTask[]>[] = []

      // Fire off 30 operations as fast as possible
      for (let i = 0; i < 30; i++) {
        const promise = atomicUpdate<TestTask[]>(
          rapidFile,
          async (tasks) => {
            const task: TestTask = {
              id: `task-${i}`,
              title: `Rapid Task ${i}`,
              status: 'todo',
            }
            return [...tasks, task]
          },
          []
        )
        promises.push(promise)
      }

      // Don't await between fires - let them queue up
      const results = await Promise.all(promises)

      expect(results).toHaveLength(30)
      const final = await atomicRead<TestTask[]>(rapidFile)
      expect(final.length).toBe(30)

      // Verify all tasks are present and unique
      const ids = new Set(final.map(t => t.id))
      expect(ids.size).toBe(30)
    })
  })

  describe('File Locking Behavior', () => {
    it('concurrent file locks are serialized', async () => {
      const lockFile = path.join(testDir, 'lock-test.json')
      const executionOrder: number[] = []

      const promises = Array.from({ length: 5 }, (_, index) =>
        atomicUpdate<{ index: number }[]>(
          lockFile,
          async (data) => {
            // Simulate work while locked
            await new Promise(resolve => setTimeout(resolve, 10))
            executionOrder.push(index)
            return [...data, { index }]
          },
          []
        )
      )

      await Promise.all(promises)

      // Verify operations completed in order (serialized)
      expect(executionOrder).toHaveLength(5)
      expect(executionOrder).toEqual([0, 1, 2, 3, 4])
    })

    it('lock recovery from stale lock files', async () => {
      const lockTestFile = path.join(testDir, 'lock-recovery.json')

      // Write initial data
      await atomicWrite<{ count: number }>(lockTestFile, { count: 0 })

      // Simulate stale lock cleanup
      clearAllLocks()
      expect(getLockCount()).toBe(0)

      // Operations should still work even if locks were cleaned
      const result = await atomicUpdate<{ count: number }>(
        lockTestFile,
        async (data) => ({ count: data.count + 1 }),
        { count: 0 }
      )

      expect(result.count).toBe(1)
    })
  })
})
