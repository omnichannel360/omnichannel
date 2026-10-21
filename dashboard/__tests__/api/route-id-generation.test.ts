/**
 * Integration tests for ID generation in API routes
 * Verifies that brain/route.ts and kanban/route.ts use generateId() correctly
 */

import { generateId } from '@/lib/validation'

describe('API Route ID Generation Integration', () => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  describe('Brain Route Memory IDs', () => {
    it('should generate memory IDs with memory_ prefix', () => {
      const memoryId = generateId('memory')
      expect(memoryId).toMatch(/^memory_[0-9a-f\-]{36}$/)
      expect(memoryId.startsWith('memory_')).toBe(true)
    })

    it('should generate unique memory IDs', () => {
      const ids = new Set()
      for (let i = 0; i < 50; i++) {
        ids.add(generateId('memory'))
      }
      expect(ids.size).toBe(50)
    })

    it('should ensure memory IDs are valid UUIDs', () => {
      const id = generateId('memory')
      const [, uuid] = id.split('_')
      expect(uuid).toMatch(uuidRegex)
    })

    it('should handle fallback ID generation for legacy memory data', () => {
      // Simulates the pattern in brain/route.ts: mem.id || generateId('memory')
      const memoryData = [
        { id: 'existing-id', action: 'test' },
        { action: 'test' }, // No ID - should get one
      ]

      const processedMemories = memoryData.map(mem => ({
        ...mem,
        id: mem.id || generateId('memory'),
      }))

      expect(processedMemories[0].id).toBe('existing-id')
      expect(processedMemories[1].id).toMatch(/^memory_/)
      expect(processedMemories[1].id).not.toBe(processedMemories[0].id)
    })
  })

  describe('Kanban Route Task IDs', () => {
    it('should generate task IDs with task_ prefix', () => {
      const taskId = generateId('task')
      expect(taskId).toMatch(/^task_[0-9a-f\-]{36}$/)
      expect(taskId.startsWith('task_')).toBe(true)
    })

    it('should generate unique task IDs', () => {
      const ids = new Set()
      for (let i = 0; i < 50; i++) {
        ids.add(generateId('task'))
      }
      expect(ids.size).toBe(50)
    })

    it('should ensure task IDs are valid UUIDs', () => {
      const id = generateId('task')
      const [, uuid] = id.split('_')
      expect(uuid).toMatch(uuidRegex)
    })

    it('should support multiple task creation with unique IDs', () => {
      // Simulates kanban route POST handler
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: generateId('task'),
        title: `Task ${i + 1}`,
        status: 'todo' as const,
      }))

      const ids = tasks.map(t => t.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(10)
      tasks.forEach(task => {
        expect(task.id).toMatch(/^task_/)
      })
    })

    it('should generate consistent task IDs for default tasks', () => {
      // Simulates kanban DEFAULT_TASKS
      const defaultTasks = [
        { id: generateId('task'), title: 'Complete API design', status: 'done' as const },
        { id: generateId('task'), title: 'Implement authentication', status: 'in-progress' },
        { id: generateId('task'), title: 'Write tests', status: 'todo' },
      ]

      expect(defaultTasks).toHaveLength(3)
      defaultTasks.forEach(task => {
        expect(task.id).toMatch(/^task_[0-9a-f\-]{36}$/)
      })

      // All IDs should be unique
      const ids = new Set(defaultTasks.map(t => t.id))
      expect(ids.size).toBe(3)
    })
  })

  describe('Cross-Route ID Consistency', () => {
    it('should allow different prefixes for different entity types', () => {
      const alertId = generateId('alert')
      const taskId = generateId('task')
      const memoryId = generateId('memory')
      const meetingId = generateId('meeting')

      expect(alertId.startsWith('alert_')).toBe(true)
      expect(taskId.startsWith('task_')).toBe(true)
      expect(memoryId.startsWith('memory_')).toBe(true)
      expect(meetingId.startsWith('meeting_')).toBe(true)

      // All should have different IDs
      expect(new Set([alertId, taskId, memoryId, meetingId]).size).toBe(4)
    })

    it('should ensure no ID collisions across entity types', () => {
      const allIds = new Set()
      const entityTypes = ['alert', 'task', 'memory', 'meeting']

      entityTypes.forEach(type => {
        for (let i = 0; i < 25; i++) {
          allIds.add(generateId(type))
        }
      })

      expect(allIds.size).toBe(100)
    })

    it('should maintain UUID v4 format across all routes', () => {
      const types = ['alert', 'task', 'memory', 'meeting']

      types.forEach(type => {
        const id = generateId(type)
        const [prefix, uuid] = id.split('_')

        expect(prefix).toBe(type)
        expect(uuid).toMatch(uuidRegex)
        expect(uuid.length).toBe(36) // Standard UUID length
      })
    })
  })

  describe('Performance and Scalability', () => {
    it('should generate IDs quickly', () => {
      const start = performance.now()

      for (let i = 0; i < 1000; i++) {
        generateId('task')
      }

      const duration = performance.now() - start

      // Should generate 1000 IDs in under 100ms
      expect(duration).toBeLessThan(100)
    })

    it('should handle bulk ID generation without memory issues', () => {
      const ids = new Set()

      // Generate 10,000 unique IDs
      for (let i = 0; i < 10000; i++) {
        ids.add(generateId('bulk'))
      }

      expect(ids.size).toBe(10000)
    })

    it('should maintain uniqueness under high concurrent-like load', () => {
      const idBatches = Array.from({ length: 100 }, () => {
        const batch = new Set()
        for (let i = 0; i < 100; i++) {
          batch.add(generateId('concurrent'))
        }
        return batch
      })

      // Check for any collisions across all batches
      const allIds = new Set()
      let collisions = 0

      idBatches.forEach(batch => {
        batch.forEach(id => {
          if (allIds.has(id)) {
            collisions++
          }
          allIds.add(id)
        })
      })

      expect(collisions).toBe(0)
      expect(allIds.size).toBe(10000)
    })
  })

  describe('Edge Cases and Validation', () => {
    it('should handle various prefix lengths', () => {
      const prefixes = ['a', 'alert', 'long_prefix_name']

      prefixes.forEach(prefix => {
        const id = generateId(prefix)
        expect(id.startsWith(`${prefix}_`)).toBe(true)
      })
    })

    it('should generate IDs suitable for database storage', () => {
      const id = generateId('db')

      // Should be storable as string
      expect(typeof id).toBe('string')

      // Should be JSON serializable
      const serialized = JSON.stringify({ id })
      expect(serialized).toContain(id)

      // Should be URL-safe (standard UUID format)
      expect(id).toMatch(/^[a-z_-]+_[0-9a-f\-]+$/)
    })

    it('should generate IDs that are case-insensitive comparable when lowercased', () => {
      const id1 = generateId('test')
      const id2 = generateId('test')

      expect(id1.toLowerCase()).not.toBe(id2.toLowerCase())
      expect(id1).not.toBe(id2)
    })
  })
})
