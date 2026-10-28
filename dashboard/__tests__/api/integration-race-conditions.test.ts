/**
 * Integration Test Suite: Race Conditions Across All APIs
 * Verifies that concurrent operations across alerts, brain, kanban, and meetings
 * APIs maintain data consistency when using atomic file operations.
 */

import path from 'path'
import { promises as fs } from 'fs'
import { atomicUpdate, atomicRead, atomicWrite, atomicConditionalUpdate, atomicReadModifyWrite } from '@/lib/atomic-file-ops'
import { atomicReaddir, atomicMkdir } from '@/lib/atomic-dir-ops'
import { clearAllLocks } from '@/lib/file-lock'

describe('Integration Tests - Race Conditions Across All APIs', () => {
  const testBaseDir = path.join(process.cwd(), 'data', 'integration-tests')
  const alertsFile = path.join(testBaseDir, 'alerts.json')
  const tasksFile = path.join(testBaseDir, 'tasks.json')
  const meetingsLogFile = path.join(testBaseDir, 'meetings-log.json')
  const brainDir = path.join(testBaseDir, 'brain')

  beforeAll(async () => {
    try {
      await fs.mkdir(testBaseDir, { recursive: true })
      await fs.mkdir(brainDir, { recursive: true })
    } catch {
      // Already exists
    }
  })

  beforeEach(async () => {
    clearAllLocks()
    // Clean up test files
    for (const file of [alertsFile, tasksFile, meetingsLogFile]) {
      try {
        await fs.unlink(file)
      } catch {
        // File doesn't exist
      }
    }
    // Clean up brain directory
    try {
      await fs.rm(brainDir, { recursive: true, force: true })
      await fs.mkdir(brainDir, { recursive: true })
    } catch {
      // Already cleaned
    }

  })

  afterAll(async () => {
    clearAllLocks()
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true })
    } catch {
      // Cleanup failed
    }
  })

  describe('Cross-API Concurrent Operations', () => {
    it('simultaneous updates to all four APIs maintain consistency', async () => {
      interface Alert {
        id: string
        timestamp: string
        level: string
        component: string
        message: string
        status: string
      }

      interface Task {
        id: string
        title: string
        status: string
      }

      interface MeetingLog {
        timestamp: string
        meeting_type: string
        skill_triggered: string
        status: string
      }

      // Fire off concurrent operations to all 4 APIs
      const [alerts, tasks, meetings] = await Promise.all([
        // Alerts API: add 5 alerts concurrently
        Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            atomicUpdate<Alert[]>(alertsFile, async (data) => {
              const alert: Alert = {
                id: `alert-${i}`,
                timestamp: new Date().toISOString(),
                level: 'info',
                component: `component-${i}`,
                message: `Alert ${i}`,
                status: 'active',
              }
              return [...(Array.isArray(data) ? data : []), alert]
            }, [])
          )
        ),

        // Kanban API: add 5 tasks concurrently
        Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            atomicUpdate<Task[]>(tasksFile, async (data) => {
              const task: Task = {
                id: `task-${i}`,
                title: `Task ${i}`,
                status: 'todo',
              }
              return [...(Array.isArray(data) ? data : []), task]
            }, [])
          )
        ),

        // Meetings API: add 5 meeting logs concurrently
        Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            atomicUpdate<MeetingLog[]>(meetingsLogFile, async (data) => {
              const log: MeetingLog = {
                timestamp: new Date().toISOString(),
                meeting_type: 'standup',
                skill_triggered: 'skill-sync',
                status: 'completed',
              }
              return [...(Array.isArray(data) ? data : []), log]
            }, [])
          )
        ),
      ])

      // Verify all operations succeeded and returned correct counts
      expect(alerts).toHaveLength(5)
      expect(tasks).toHaveLength(5)
      expect(meetings).toHaveLength(5)

      // Verify data consistency by reading back and checking for duplicates
      const finalAlerts = await atomicRead<Alert[]>(alertsFile)
      const finalTasks = await atomicRead<Task[]>(tasksFile)
      const finalMeetings = await atomicRead<MeetingLog[]>(meetingsLogFile)

      expect(finalAlerts).toHaveLength(5)
      expect(finalTasks).toHaveLength(5)
      expect(finalMeetings).toHaveLength(5)

      // Verify no data loss or duplication via unique ID sets
      const alertIds = new Set(finalAlerts.map(a => a.id))
      const taskIds = new Set(finalTasks.map(t => t.id))
      expect(alertIds.size).toBe(5) // No duplicate alert IDs
      expect(taskIds.size).toBe(5) // No duplicate task IDs
    })

    it('atomic directory operations prevent race conditions in brain directory', async () => {
      // Simulate concurrent directory enumeration and file creation
      const operations = [
        // Concurrent readdir operations (should all succeed atomically)
        ...Array.from({ length: 3 }, () => atomicReaddir(brainDir)),

        // Concurrent mkdir operations (should serialize safely)
        ...Array.from({ length: 3 }, (_, i) => atomicMkdir(path.join(brainDir, `subdir-${i}`))),

        // File creation after atomic operations
        ...Array.from({ length: 3 }, (_, i) =>
          atomicWrite(path.join(brainDir, `memory-${i}.json`), {
            id: `mem-${i}`,
            timestamp: new Date().toISOString(),
            category: 'integration-test',
          })
        ),
      ]

      const results = await Promise.all(operations)
      expect(results).toHaveLength(9)

      // Verify directory was created and contains files
      const files = await atomicReaddir(brainDir)
      const jsonFiles = files.filter(f => f.endsWith('.json'))
      expect(jsonFiles.length).toBe(3)
    })

    it('lost update anomaly prevention across all APIs', async () => {
      interface Counter {
        count: number
      }

      const counterFile = path.join(testBaseDir, 'counter.json')

      // Initialize counter
      await atomicWrite<Counter>(counterFile, { count: 0 })

      // Concurrent increments
      const promises = Array.from({ length: 20 }, () =>
        atomicUpdate<Counter>(counterFile, async (data) => {
          return { count: data.count + 1 }
        }, { count: 0 })
      )

      await Promise.all(promises)
      const final = await atomicRead<Counter>(counterFile)

      // Should have exactly 20, not lost any due to race conditions
      expect(final.count).toBe(20)
    })

    it('high-concurrency stress test - 100 operations across multiple files', async () => {
      interface DataRecord {
        id: string
        value: number
        timestamp: string
      }

      const files = [
        path.join(testBaseDir, 'stress-1.json'),
        path.join(testBaseDir, 'stress-2.json'),
        path.join(testBaseDir, 'stress-3.json'),
      ]

      // Distribute 100 operations across 3 files (33-33-34)
      const promises = Array.from({ length: 100 }, (_, i) => {
        const fileIndex = i % 3
        return atomicUpdate<DataRecord[]>(files[fileIndex], async (data) => {
          const record: DataRecord = {
            id: `record-${i}`,
            value: i,
            timestamp: new Date().toISOString(),
          }
          return [...(Array.isArray(data) ? data : []), record]
        }, [])
      })

      const results = await Promise.all(promises)
      expect(results).toHaveLength(100)

      // Verify all files contain the expected data
      for (const file of files) {
        const data = await atomicRead<DataRecord[]>(file)
        // Distribution across 3 files: first 2 get 33, last gets 34
        expect([33, 34]).toContain(data.length)
      }
    })

    it('sequential vs concurrent reads return consistent data', async () => {
      interface Item {
        id: string
        data: string
      }

      const file = path.join(testBaseDir, 'consistency-test.json')
      const items: Item[] = Array.from({ length: 10 }, (_, i) => ({
        id: `item-${i}`,
        data: `data-${i}`,
      }))

      await atomicWrite<Item[]>(file, items)

      // Perform 10 concurrent reads
      const concurrentReads = await Promise.all(
        Array.from({ length: 10 }, () => atomicRead<Item[]>(file))
      )

      // All should return identical data
      const firstRead = concurrentReads[0]
      for (const read of concurrentReads) {
        expect(read).toEqual(firstRead)
        expect(read).toHaveLength(10)
      }
    })
  })

  describe('Error Handling Under Load', () => {
    it('partial failures do not corrupt data state', async () => {
      interface Record {
        id: string
        value: number
      }

      const file = path.join(testBaseDir, 'error-resilience.json')

      const promises = Array.from({ length: 20 }, (_, i) =>
        atomicUpdate<Record[]>(file, async (data) => {
          // Every 4th operation fails
          if (i % 4 === 0) {
            throw new Error(`Intentional error at ${i}`)
          }

          const record: Record = { id: `rec-${i}`, value: i }
          return [...(Array.isArray(data) ? data : []), record]
        }, []).catch(() => null)
      )

      const results = await Promise.all(promises)
      const successes = results.filter(r => r !== null).length
      const failures = results.filter(r => r === null).length

      expect(successes + failures).toBe(20)
      expect(failures).toBe(5) // Every 4th operation fails: 20/4 = 5 failures

      // Data should only contain successful writes
      const finalData = await atomicRead<Record[]>(file)
      expect(finalData.length).toBe(successes)

      // Verify all records in file are valid and have unique IDs
      const ids = new Set(finalData.map(r => r.id))
      expect(ids.size).toBe(finalData.length) // No duplicates
    })

    it('timeout and lock recovery under sustained load', async () => {
      interface LongOp {
        id: string
        duration: number
      }

      const file = path.join(testBaseDir, 'timeout-test.json')

      // Fire off rapid operations
      const promises = Array.from({ length: 50 }, (_, i) =>
        atomicUpdate<LongOp[]>(file, async (data) => {
          // Simulate some work
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10))

          return [...(Array.isArray(data) ? data : []), { id: `op-${i}`, duration: i }]
        }, [])
      )

      const results = await Promise.all(promises)
      expect(results).toHaveLength(50)

      const finalData = await atomicRead<LongOp[]>(file)
      expect(finalData.length).toBe(50)
    })
  })

  describe('Conditional Update Operations', () => {
    it('atomicConditionalUpdate - applies update only when condition is true', async () => {
      interface Counter {
        count: number
        updated: boolean
      }

      const file = path.join(testBaseDir, 'conditional-update.json')
      const initial: Counter = { count: 0, updated: false }

      await atomicWrite<Counter>(file, initial)

      // Condition: count < 10
      const result1 = await atomicConditionalUpdate<Counter>(
        file,
        (data) => data.count < 10,
        async (data) => ({ count: data.count + 1, updated: true }),
        initial
      )

      expect(result1.updated).toBe(true)
      expect(result1.data.count).toBe(1)

      // Condition: count < 10 (should still be true)
      const result2 = await atomicConditionalUpdate<Counter>(
        file,
        (data) => data.count < 10,
        async (data) => ({ count: data.count + 5, updated: true }),
        initial
      )

      expect(result2.updated).toBe(true)
      expect(result2.data.count).toBe(6)

      // Condition: count < 5 (should be false now)
      const result3 = await atomicConditionalUpdate<Counter>(
        file,
        (data) => data.count < 5,
        async (data) => ({ count: data.count + 100, updated: true }),
        initial
      )

      expect(result3.updated).toBe(false)
      expect(result3.data.count).toBe(6) // Unchanged
    })

    it('atomicReadModifyWrite - applies transformation and persists result', async () => {
      interface Document {
        id: string
        content: string
        version: number
      }

      const file = path.join(testBaseDir, 'read-modify-write.json')
      const initial: Document = {
        id: 'doc-1',
        content: 'Initial content',
        version: 1,
      }

      await atomicWrite<Document>(file, initial)

      // Modify the document
      const modified = await atomicReadModifyWrite<Document>(
        file,
        async (doc) => ({
          ...doc,
          content: `${doc.content} - Modified`,
          version: doc.version + 1,
        }),
        initial
      )

      expect(modified.content).toContain('Modified')
      expect(modified.version).toBe(2)

      // Verify persistence
      const fromDisk = await atomicRead<Document>(file)
      expect(fromDisk.version).toBe(2)
      expect(fromDisk.content).toContain('Modified')
    })
  })

  describe('Concurrent Conditional Updates', () => {
    it('concurrent conditional updates respect condition checks', async () => {
      interface Status {
        state: string
        updateCount: number
      }

      const file = path.join(testBaseDir, 'concurrent-conditional.json')
      const initial: Status = { state: 'pending', updateCount: 0 }

      await atomicWrite<Status>(file, initial)

      // 10 concurrent conditional updates - only some should succeed
      const promises = Array.from({ length: 10 }, (_, i) =>
        atomicConditionalUpdate<Status>(
          file,
          (data) => data.updateCount < 5, // Only first 5 can succeed
          async (data) => ({
            state: 'updated',
            updateCount: data.updateCount + 1,
          }),
          initial
        )
      )

      const results = await Promise.all(promises)
      const successes = results.filter((r) => r.updated).length
      const failures = results.filter((r) => !r.updated).length

      // Exactly 5 should succeed, 5 should fail
      expect(successes).toBe(5)
      expect(failures).toBe(5)

      // Verify final state
      const final = await atomicRead<Status>(file)
      expect(final.updateCount).toBe(5)
    })

    it('read-modify-write preserves consistency under concurrent load', async () => {
      interface Accumulator {
        total: number
        operations: number
      }

      const file = path.join(testBaseDir, 'concurrent-rmw.json')
      const initial: Accumulator = { total: 0, operations: 0 }

      await atomicWrite<Accumulator>(file, initial)

      // 20 concurrent read-modify-write operations
      const promises = Array.from({ length: 20 }, (_, i) =>
        atomicReadModifyWrite<Accumulator>(
          file,
          async (data) => ({
            total: data.total + (i + 1),
            operations: data.operations + 1,
          }),
          initial
        )
      )

      await Promise.all(promises)
      const final = await atomicRead<Accumulator>(file)

      // Verify all operations completed
      expect(final.operations).toBe(20)

      // Verify total: 1+2+...+20 = 210
      expect(final.total).toBe(210)
    })
  })
})

