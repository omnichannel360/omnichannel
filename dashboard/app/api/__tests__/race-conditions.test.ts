/**
 * Integration tests for race condition fixes in API routes
 * Simulates concurrent requests to verify atomicity and data consistency
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { atomicRead, atomicUpdate } from '@/lib/atomic-file-ops'
import { atomicReaddir } from '@/lib/atomic-dir-ops'

describe('API Route Race Condition Integration Tests', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `api-race-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('Alerts API - Concurrent Create/Read', () => {
    it('should handle concurrent alert creations without data loss', async () => {
      const alertsFile = path.join(testDir, 'alerts.json')

      // Simulate 10 concurrent POST requests creating alerts
      const alertIds: string[] = []

      const createAlerts = await Promise.all(
        Array(10)
          .fill(null)
          .map(async (_, index) => {
            const result = await atomicUpdate(alertsFile, async (current) => {
              const alerts = Array.isArray(current) ? current : []
              const newAlert = {
                id: `alert-${index}`,
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `Alert ${index}`,
                status: 'active',
              }
              return [...alerts, newAlert]
            }, [])
            return result
          })
      )

      expect(createAlerts).toHaveLength(10)

      // Verify all alerts were saved
      const saved = await atomicRead(alertsFile)
      expect(Array.isArray(saved) && saved.length).toBe(10)
    })

    it('should maintain alert consistency with concurrent read/write', async () => {
      const alertsFile = path.join(testDir, 'alerts.json')
      const initialAlerts = Array(5)
        .fill(null)
        .map((_, i) => ({
          id: `alert-${i}`,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Initial alert ${i}`,
          status: 'active',
        }))

      await atomicUpdate(alertsFile, async () => initialAlerts, [])

      // Simulate 5 GET + 5 PATCH requests concurrently
      const operations = await Promise.all([
        // Read operations
        ...Array(5)
          .fill(null)
          .map(() => atomicRead(alertsFile)),

        // Update operations (mark as resolved)
        ...Array(5)
          .fill(null)
          .map((_, i) =>
            atomicUpdate(alertsFile, async (current) => {
              const alerts = Array.isArray(current) ? current : []
              return alerts.map((a, idx) => {
                if (idx === i) {
                  return { ...a, status: 'resolved' }
                }
                return a
              })
            }, [])
          ),
      ])

      // Verify final state
      const finalAlerts = await atomicRead(alertsFile)
      const resolvedCount = Array.isArray(finalAlerts) ? finalAlerts.filter(a => a.status === 'resolved').length : 0
      expect(resolvedCount).toBeGreaterThanOrEqual(5)
    })
  })

  describe('Kanban API - Concurrent Task Updates', () => {
    it('should handle concurrent task status changes without lost updates', async () => {
      const tasksFile = path.join(testDir, 'kanban.json')

      // Create initial tasks
      const initialTasks = Array(5)
        .fill(null)
        .map((_, i) => ({
          id: `task-${i}`,
          title: `Task ${i}`,
          status: 'todo',
        }))

      await atomicUpdate(tasksFile, async () => initialTasks, [])

      // Simulate 5 concurrent PATCH requests updating task statuses
      const updates = await Promise.all(
        Array(5)
          .fill(null)
          .map((_, i) =>
            atomicUpdate(tasksFile, async (current) => {
              const tasks = Array.isArray(current) ? current : []
              return tasks.map((t, idx) => {
                if (idx === i) {
                  return { ...t, status: 'in-progress' }
                }
                return t
              })
            }, [])
          )
      )

      // Verify all updates applied
      const finalTasks = await atomicRead(tasksFile)
      const inProgressCount = Array.isArray(finalTasks) ? finalTasks.filter(t => t.status === 'in-progress').length : 0
      expect(inProgressCount).toBe(5)
    })

    it('should prevent lost updates when multiple processes modify same file', async () => {
      const tasksFile = path.join(testDir, 'kanban.json')

      // Counter file to track updates
      const counter = { value: 0 }
      await atomicUpdate(tasksFile, async () => counter, { value: 0 })

      // Simulate 20 concurrent increment operations
      const results = await Promise.all(
        Array(20)
          .fill(null)
          .map(() =>
            atomicUpdate(tasksFile, async (current) => {
              const data = current as typeof counter
              return { value: (typeof data?.value === 'number' ? data.value : 0) + 1 }
            }, { value: 0 })
          )
      )

      // Verify all increments applied (no lost updates)
      const final = await atomicRead(tasksFile)
      expect((final as typeof counter).value).toBe(20)
    })
  })

  describe('Brain API - Concurrent Memory Writes', () => {
    it('should handle concurrent memory file writes to different files', async () => {
      const brainDir = path.join(testDir, 'brain')
      await fs.mkdir(brainDir, { recursive: true })

      // Simulate writing 10 different memory files concurrently
      const writes = await Promise.all(
        Array(10)
          .fill(null)
          .map((_, i) =>
            atomicUpdate(path.join(brainDir, `memory-${i}.json`), async () => ({
              id: `mem-${i}`,
              timestamp: new Date().toISOString(),
              category: 'test',
            }), {})
          )
      )

      // Verify all files written
      const files = await atomicReaddir(brainDir)
      expect(files).toHaveLength(10)
    })

    it('should maintain consistent directory state during concurrent read/write', async () => {
      const brainDir = path.join(testDir, 'brain')
      await fs.mkdir(brainDir, { recursive: true })

      // Pre-create some files
      for (let i = 0; i < 5; i++) {
        await atomicUpdate(path.join(brainDir, `memory-${i}.json`), async () => ({ id: `mem-${i}` }), {})
      }

      // Concurrent reads and writes
      const operations = await Promise.all([
        // Directory reads
        ...Array(3)
          .fill(null)
          .map(() => atomicReaddir(brainDir)),

        // File writes
        ...Array(3)
          .fill(null)
          .map((_, i) =>
            atomicUpdate(path.join(brainDir, `memory-${i + 5}.json`), async () => ({ id: `mem-${i + 5}` }), {})
          ),
      ])

      // Verify final state
      const finalFiles = await atomicReaddir(brainDir)
      expect(finalFiles.length).toBeGreaterThanOrEqual(5)
    })
  })

  describe('Meetings API - Concurrent Log Updates', () => {
    it('should append meeting logs without loss or corruption', async () => {
      const logsFile = path.join(testDir, 'meetings-log.json')

      // Simulate 15 concurrent meeting log entries
      const logs = await Promise.all(
        Array(15)
          .fill(null)
          .map((_, i) =>
            atomicUpdate(logsFile, async (current) => {
              const existingLogs = Array.isArray(current) ? current : []
              const newLog = {
                timestamp: new Date().toISOString(),
                meeting_type: 'standup',
                skill_triggered: 'planning',
                status: 'scheduled',
                log_index: i,
              }
              return [...existingLogs, newLog]
            }, [])
          )
      )

      // Verify all logs saved
      const finalLogs = await atomicRead(logsFile)
      expect(Array.isArray(finalLogs) && finalLogs.length).toBe(15)

      // Verify no duplicates
      const indices = Array.isArray(finalLogs) ? finalLogs.map(l => (l as any).log_index) : []
      const uniqueIndices = new Set(indices)
      expect(uniqueIndices.size).toBe(15)
    })
  })

  describe('Cross-Route Consistency', () => {
    it('should maintain consistency across multiple file types', async () => {
      const alertsFile = path.join(testDir, 'alerts.json')
      const tasksFile = path.join(testDir, 'tasks.json')

      // Initialize files
      await Promise.all([
        atomicUpdate(alertsFile, async () => [], []),
        atomicUpdate(tasksFile, async () => [], []),
      ])

      // Concurrent operations on different files
      await Promise.all([
        // Alert operations
        atomicUpdate(alertsFile, async (current) => [...(Array.isArray(current) ? current : []), { id: 'a1' }], []),
        atomicUpdate(alertsFile, async (current) => [...(Array.isArray(current) ? current : []), { id: 'a2' }], []),

        // Task operations
        atomicUpdate(tasksFile, async (current) => [...(Array.isArray(current) ? current : []), { id: 't1' }], []),
        atomicUpdate(tasksFile, async (current) => [...(Array.isArray(current) ? current : []), { id: 't2' }], []),
      ])

      // Verify both files updated
      const [alerts, tasks] = await Promise.all([atomicRead(alertsFile), atomicRead(tasksFile)])

      expect(Array.isArray(alerts) && alerts.length).toBe(2)
      expect(Array.isArray(tasks) && tasks.length).toBe(2)
    })
  })

  describe('Error Handling Under Contention', () => {
    it('should recover gracefully from errors during concurrent operations', async () => {
      const file = path.join(testDir, 'test.json')

      const operations = await Promise.allSettled(
        Array(10)
          .fill(null)
          .map((_, i) =>
            atomicUpdate(file, async (current) => {
              if (i === 5) {
                throw new Error('Simulated error')
              }
              const arr = Array.isArray(current) ? current : []
              return [...arr, i]
            }, [])
          )
      )

      // Most should succeed, one should fail
      const successful = operations.filter(op => op.status === 'fulfilled').length
      const failed = operations.filter(op => op.status === 'rejected').length

      expect(successful).toBe(9)
      expect(failed).toBe(1)

      // File should contain successful updates
      const final = await atomicRead(file)
      expect(Array.isArray(final)).toBe(true)
    })
  })
})
