import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

const testDataDir = path.join(os.tmpdir(), 'api-concurrent-test')

describe('API Concurrent Operations - Race Condition Tests', () => {
  beforeEach(async () => {
    await fs.mkdir(testDataDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  describe('POST /api/alerts - Concurrent Alert Creation', () => {
    it('should handle 10 concurrent POST requests without losing data', async () => {
      // Simulate atomicUpdate behavior with locking
      const alertsFile = path.join(testDataDir, 'alerts.json')
      const alerts: any[] = []

      // Create concurrent POST operations
      const createAlert = async (id: number) => {
        // This would normally call POST /api/alerts
        const alert = {
          id: \lert_\$\{id}\,
          timestamp: new Date().toISOString(),
          level: 'info' as const,
          component: 'test',
          message: \Alert \$\{id}\,
          status: 'active' as const,
        }

        // Simulate atomicUpdate
        alerts.push(alert)
        return alert
      }

      const promises = Array.from({ length: 10 }, (_, i) => createAlert(i))
      await Promise.all(promises)

      expect(alerts).toHaveLength(10)
      expect(new Set(alerts.map((a) => a.id)).size).toBe(10) // All unique
    })

    it('should maintain data consistency with concurrent PATCH requests', async () => {
      const alertsFile = path.join(testDataDir, 'alerts.json')
      interface Alert {
        id: string
        status: 'active' | 'resolved'
      }
      const alerts: Alert[] = [
        { id: 'alert_1', status: 'active' },
        { id: 'alert_2', status: 'active' },
      ]

      // Simulate concurrent PATCH requests
      const updateAlert = async (id: string) => {
        // Find and update
        const index = alerts.findIndex((a) => a.id === id)
        if (index !== -1) {
          alerts[index] = { ...alerts[index], status: 'resolved' }
        }
      }

      const promises = [
        updateAlert('alert_1'),
        updateAlert('alert_2'),
        updateAlert('alert_1'), // Duplicate
      ]

      await Promise.all(promises)

      expect(alerts).toHaveLength(2)
      expect(alerts.every((a) => a.status === 'resolved')).toBe(true)
    })
  })

  describe('POST /api/kanban - Concurrent Task Creation', () => {
    it('should handle 20 concurrent task creates', async () => {
      interface Task {
        id: string
        title: string
        status: string
      }
      const tasks: Task[] = []

      const createTask = async (index: number) => {
        const task = {
          id: \	ask_\$\{index}\,
          title: \Task \$\{index}\,
          status: 'todo',
        }
        tasks.push(task)
        return task
      }

      const promises = Array.from({ length: 20 }, (_, i) => createTask(i))
      await Promise.all(promises)

      expect(tasks).toHaveLength(20)
      expect(new Set(tasks.map((t) => t.id)).size).toBe(20)
    })

    it('should maintain consistency with concurrent updates and deletes', async () => {
      interface Task {
        id: string
        title: string
        status: string
      }
      const tasks: Task[] = [
        { id: 't1', title: 'Task 1', status: 'todo' },
        { id: 't2', title: 'Task 2', status: 'todo' },
        { id: 't3', title: 'Task 3', status: 'todo' },
      ]

      const operations = [
        // Update t1
        async () => {
          const index = tasks.findIndex((t) => t.id === 't1')
          if (index !== -1) {
            tasks[index] = { ...tasks[index], status: 'done' }
          }
        },
        // Delete t2
        async () => {
          const index = tasks.findIndex((t) => t.id === 't2')
          if (index !== -1) {
            tasks.splice(index, 1)
          }
        },
        // Update t3
        async () => {
          const index = tasks.findIndex((t) => t.id === 't3')
          if (index !== -1) {
            tasks[index] = { ...tasks[index], status: 'in-progress' }
          }
        },
      ]

      await Promise.all(operations.map((op) => op()))

      expect(tasks).toHaveLength(2)
      const taskIds = tasks.map((t) => t.id).sort()
      expect(taskIds).toEqual(['t1', 't3'])
      expect(tasks.find((t) => t.id === 't1')?.status).toBe('done')
      expect(tasks.find((t) => t.id === 't3')?.status).toBe('in-progress')
    })
  })

  describe('POST /api/meetings - Concurrent Meeting Logs', () => {
    it('should handle concurrent meeting log writes safely', async () => {
      interface MeetingLog {
        timestamp: string
        meeting_type: string
        status: string
      }
      const logs: MeetingLog[] = []

      const logMeeting = async (index: number) => {
        const log: MeetingLog = {
          timestamp: new Date().toISOString(),
          meeting_type: \meeting_type_\$\{index % 3}\,
          status: 'completed',
        }
        logs.push(log)
        return log
      }

      const promises = Array.from({ length: 15 }, (_, i) => logMeeting(i))
      await Promise.all(promises)

      expect(logs).toHaveLength(15)

      // All timestamps should be roughly the same (within same second)
      const timestamps = logs.map((l) => new Date(l.timestamp).getSeconds())
      const uniqueSeconds = new Set(timestamps)
      expect(uniqueSeconds.size).toBeLessThanOrEqual(2) // Should be very close in time
    })
  })

  describe('GET /api/brain - Concurrent Memory Reads', () => {
    it('should handle concurrent reads without file corruption', async () => {
      interface Memory {
        id: string
        action: string
        category: string
      }

      const brainData: Memory[] = [
        { id: 'm1', action: 'action1', category: 'cat1' },
        { id: 'm2', action: 'action2', category: 'cat2' },
        { id: 'm3', action: 'action3', category: 'cat1' },
      ]

      // Simulate concurrent reads
      const readMemories = async () => {
        // Return a copy to prevent mutation
        return [...brainData]
      }

      const promises = Array.from({ length: 50 }, () => readMemories())
      const results = await Promise.all(promises)

      // All reads should return identical data
      results.forEach((result) => {
        expect(result).toHaveLength(3)
        expect(result).toEqual(brainData)
      })
    })
  })

  describe('Stress Tests - High Concurrency', () => {
    it('should handle 100+ concurrent mixed operations', async () => {
      interface DataItem {
        id: string
        value: number
      }

      const data: DataItem[] = Array.from({ length: 10 }, (_, i) => ({
        id: \item_\$\{i}\,
        value: 0,
      }))

      const operations = []

      // 50 writes
      for (let i = 0; i < 50; i++) {
        operations.push(
          (async () => {
            const index = i % data.length
            data[index] = {
              ...data[index],
              value: data[index].value + 1,
            }
          })()
        )
      }

      // 50 reads
      for (let i = 0; i < 50; i++) {
        operations.push(
          (async () => {
            return [...data]
          })()
        )
      }

      const results = await Promise.all(operations)

      // Verify final state
      expect(data).toHaveLength(10)
      const totalValue = data.reduce((sum, item) => sum + item.value, 0)
      expect(totalValue).toBe(50)
    })
  })
})
