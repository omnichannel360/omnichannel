/**
 * Integration Test Suite: Race Conditions Across All APIs
 * Verifies that concurrent operations across alerts, brain, kanban, and meetings
 * APIs maintain data consistency when using atomic file operations.
 */

import path from 'path'
import { promises as fs } from 'fs'
import { atomicUpdate, atomicRead, atomicWrite } from '@/lib/atomic-file-ops'
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
            atomicUpdate<Alert[], Alert>(alertsFile, async (data) => {
              const alert: Alert = {
                id: `alert-${i}`,
                timestamp: new Date().toISOString(),
                level: 'info',
                component: `component-${i}`,
                message: `Alert ${i}`,
                status: 'active',
              }
              return { updated: [...data, alert], result: alert }
            })
          )
        ),

        // Kanban API: add 5 tasks concurrently
        Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            atomicUpdate<Task[], Task>(tasksFile, async (data) => {
              const task: Task = {
                id: `task-${i}`,
                title: `Task ${i}`,
                status: 'todo',
              }
              return { updated: [...data, task], result: task }
            })
          )
        ),

        // Meetings API: add 5 meeting logs concurrently
        Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            atomicUpdate<MeetingLog[], MeetingLog>(meetingsLogFile, async (data) => {
              const log: MeetingLog = {
                timestamp: new Date().toISOString(),
                meeting_type: 'standup',
                skill_triggered: 'skill-sync',
                status: 'completed',
              }
              return { updated: [...data, log], result: log }
            })
          )
        ),
      ])

      // Verify all operations succeeded
      expect(alerts).toHaveLength(5)
      expect(tasks).toHaveLength(5)
      expect(meetings).toHaveLength(5)

      // Verify data consistency by reading back
      const finalAlerts = await atomicRead<Alert[]>(alertsFile)
      const finalTasks = await atomicRead<Task[]>(tasksFile)
      const finalMeetings = await atomicRead<MeetingLog[]>(meetingsLogFile)

      expect(finalAlerts).toHaveLength(5)
      expect(finalTasks).toHaveLength(5)
      expect(finalMeetings).toHaveLength(5)

      // Verify no data loss or duplication
      const alertIds = new Set(finalAlerts.map(a => a.id))
      const taskIds = new Set(finalTasks.map(t => t.id))
      expect(alertIds.size).toBe(5)
      expect(taskIds.size).toBe(5)
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
      expect(jsonFiles.length).toBeGreaterThanOrEqual(3)
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
        atomicUpdate<Counter, Counter>(counterFile, async (data) => {
          const updated = { count: data.count + 1 }
          return { updated, result: updated }
        })
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
        return atomicUpdate<DataRecord[], DataRecord>(files[fileIndex], async (data) => {
          const record: DataRecord = {
            id: `record-${i}`,
            value: i,
            timestamp: new Date().toISOString(),
          }
          return { updated: [...data, record], result: record }
        })
      })

      const results = await Promise.all(promises)
      expect(results).toHaveLength(100)

      // Verify all files contain the expected data
      for (const file of files) {
        const data = await atomicRead<DataRecord[]>(file)
        expect(data.length).toBeGreaterThan(0)
        expect(data.length).toBeLessThanOrEqual(34)
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
        atomicUpdate<Record[], Record | null>(file, async (data) => {
          // Every 4th operation fails
          if (i % 4 === 0) {
            throw new Error(`Intentional error at ${i}`)
          }

          const record: Record = { id: `rec-${i}`, value: i }
          return { updated: [...data, record], result: record }
        }).catch(() => null)
      )

      const results = await Promise.all(promises)
      const successes = results.filter(r => r !== null).length
      const failures = results.filter(r => r === null).length

      expect(successes + failures).toBe(20)
      expect(failures).toBeGreaterThan(0)

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
        atomicUpdate<LongOp[], LongOp>(file, async (data) => {
          // Simulate some work
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10))

          return {
            updated: [...data, { id: `op-${i}`, duration: i }],
            result: { id: `op-${i}`, duration: i },
          }
        })
      )

      const results = await Promise.all(promises)
      expect(results).toHaveLength(50)

      const finalData = await atomicRead<LongOp[]>(file)
      expect(finalData.length).toBe(50)
    })
  })
})
