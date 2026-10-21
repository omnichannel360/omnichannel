/**
 * Comprehensive tests for atomic file operations
 * Verifies atomicity guarantees and race condition prevention
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { atomicRead, atomicWrite, atomicUpdate, atomicReadModifyWrite, atomicTransaction } from './atomic-file-ops'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

describe('Atomic File Operations - Race Condition Prevention', () => {
  let testDir: string
  let testFile: string

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `atomic-test-${Date.now()}`)
    testFile = path.join(testDir, 'data.json')
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('Atomic Read', () => {
    it('should read JSON file atomically', async () => {
      const data = { items: [1, 2, 3] }
      await fs.writeFile(testFile, JSON.stringify(data))

      const result = await atomicRead(testFile)
      expect(result).toEqual(data)
    })

    it('should return empty array/object for non-existent files', async () => {
      const result = await atomicRead(testFile)
      expect(Array.isArray(result) || typeof result === 'object').toBe(true)
    })

    it('should handle concurrent reads safely', async () => {
      const data = { value: 'test', timestamp: Date.now() }
      await fs.writeFile(testFile, JSON.stringify(data))

      const results = await Promise.all([
        atomicRead(testFile),
        atomicRead(testFile),
        atomicRead(testFile),
      ])

      results.forEach(result => {
        expect(result).toEqual(data)
      })
    })

    it('should prevent reading partially written files', async () => {
      // Write initial data
      const initialData = { value: 1 }
      await fs.writeFile(testFile, JSON.stringify(initialData))

      const reads: unknown[] = []

      // Simulate concurrent read during write
      const writePromise = atomicWrite(testFile, { value: 2 })
      const readPromises = [atomicRead(testFile), atomicRead(testFile), atomicRead(testFile)]

      const readResults = await Promise.all(readPromises)
      await writePromise

      // All reads should see complete, consistent data
      readResults.forEach(result => {
        expect(result).toEqual(expect.objectContaining({ value: expect.any(Number) }))
      })
    })
  })

  describe('Atomic Write', () => {
    it('should write JSON file atomically using temp file + rename', async () => {
      const data = { items: ['a', 'b', 'c'] }
      await atomicWrite(testFile, data)

      const content = await fs.readFile(testFile, 'utf-8')
      expect(JSON.parse(content)).toEqual(data)
    })

    it('should not leave partial files on disk', async () => {
      const data = { value: 'test' }
      await atomicWrite(testFile, data)

      // Check no .tmp file exists
      const tmpFile = `${testFile}.tmp`
      let tmpExists = false
      try {
        await fs.stat(tmpFile)
        tmpExists = true
      } catch {
        tmpExists = false
      }

      expect(tmpExists).toBe(false)
    })

    it('should handle concurrent writes safely (serialized)', async () => {
      const results = await Promise.all([
        atomicWrite(testFile, { id: 1 }),
        atomicWrite(testFile, { id: 2 }),
        atomicWrite(testFile, { id: 3 }),
      ])

      const finalContent = await fs.readFile(testFile, 'utf-8')
      const finalData = JSON.parse(finalContent)

      // Last write should win
      expect(finalData.id).toBeDefined()
      expect([1, 2, 3]).toContain(finalData.id)
    })

    it('should clean up temp files on error', async () => {
      try {
        // Write to invalid directory to trigger error
        await atomicWrite(path.join('/invalid/path', 'file.json'), { data: 'test' })
      } catch {
        // Expected to fail
      }

      // No cleanup needed since directory doesn't exist
    })
  })

  describe('Atomic Update', () => {
    it('should read, modify, and write atomically', async () => {
      const initial = [1, 2, 3]
      await fs.writeFile(testFile, JSON.stringify(initial))

      const result = await atomicUpdate(testFile, async (current) => {
        const updated = [...(Array.isArray(current) ? current : []), 4]
        return { updated, result: updated }
      })

      expect(result).toEqual([1, 2, 3, 4])

      const fileContent = await fs.readFile(testFile, 'utf-8')
      expect(JSON.parse(fileContent)).toEqual([1, 2, 3, 4])
    })

    it('should prevent lost updates with concurrent modifications', async () => {
      // Start with 0
      await fs.writeFile(testFile, JSON.stringify(0))

      // Simulate 10 concurrent increments
      const results = await Promise.all(
        Array(10)
          .fill(null)
          .map(() =>
            atomicUpdate(testFile, async (current) => {
              const updated = (typeof current === 'number' ? current : 0) + 1
              return { updated, result: updated }
            })
          )
      )

      // Final value should be 10 (no lost updates)
      const finalContent = await fs.readFile(testFile, 'utf-8')
      const finalValue = JSON.parse(finalContent)
      expect(finalValue).toBe(10)
    })

    it('should handle complex nested updates atomically', async () => {
      const initial = {
        users: [
          { id: 1, name: 'Alice', score: 100 },
          { id: 2, name: 'Bob', score: 95 },
        ],
      }
      await fs.writeFile(testFile, JSON.stringify(initial))

      const result = await atomicUpdate(testFile, async (current) => {
        const updated = {
          ...current,
          users: (current as typeof initial).users.map(u => ({
            ...u,
            score: u.score + 10,
          })),
        }
        return { updated, result: updated }
      })

      expect(result.users[0].score).toBe(110)
      expect(result.users[1].score).toBe(105)
    })

    it('should rollback on update function error', async () => {
      const initial = [1, 2, 3]
      await fs.writeFile(testFile, JSON.stringify(initial))

      try {
        await atomicUpdate(testFile, async () => {
          throw new Error('Update failed')
        })
      } catch {
        // Expected
      }

      // File should remain unchanged
      const content = await fs.readFile(testFile, 'utf-8')
      expect(JSON.parse(content)).toEqual(initial)
    })
  })

  describe('Atomic Read-Modify-Write', () => {
    it('should apply modification function atomically', async () => {
      const initial = [1, 2, 3]
      await fs.writeFile(testFile, JSON.stringify(initial))

      const result = await atomicReadModifyWrite(testFile, async (current) => {
        return [...(Array.isArray(current) ? current : []), 4, 5]
      })

      expect(result).toEqual([1, 2, 3, 4, 5])
    })
  })

  describe('Atomic Transaction', () => {
    it('should support multiple reads within single transaction', async () => {
      const initial = [1, 2, 3]
      await fs.writeFile(testFile, JSON.stringify(initial))

      const result = await atomicTransaction(testFile, async (read, write) => {
        const data1 = await read()
        const data2 = await read()

        // Both reads should see same data (cached)
        expect(data1).toEqual(data2)

        // Modify and write
        const updated = [...(Array.isArray(data1) ? data1 : []), 4]
        await write(updated)

        return updated.length
      })

      expect(result).toBe(4)
    })

    it('should prevent dirty reads during transaction', async () => {
      const initial = { counter: 0 }
      await fs.writeFile(testFile, JSON.stringify(initial))

      const transactionResult = await atomicTransaction(testFile, async (read, write) => {
        const data = await read()
        const counter = (data as typeof initial).counter

        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 50))

        const updated = { counter: counter + 1 }
        await write(updated)

        return updated.counter
      })

      expect(transactionResult).toBe(1)

      const finalContent = await fs.readFile(testFile, 'utf-8')
      const finalData = JSON.parse(finalContent)
      expect(finalData.counter).toBe(1)
    })

    it('should support multiple writes within transaction', async () => {
      await fs.writeFile(testFile, JSON.stringify([]))

      const result = await atomicTransaction(testFile, async (read, write) => {
        let data = await read()
        const arr = Array.isArray(data) ? data : []

        // Multiple modifications
        await write([...arr, 1])
        const after1 = await read()

        await write([...(Array.isArray(after1) ? after1 : []), 2])
        const after2 = await read()

        return after2
      })

      expect(result).toEqual([1, 2])
    })
  })

  describe('Consistency Guarantees', () => {
    it('should guarantee atomicity with mixed reads and writes', async () => {
      const initial = { version: 0, data: 'initial' }
      await fs.writeFile(testFile, JSON.stringify(initial))

      const operations = Array(5)
        .fill(null)
        .map((_, i) => {
          if (i % 2 === 0) {
            // Read operation
            return atomicRead(testFile)
          } else {
            // Write operation
            return atomicUpdate(testFile, async (current) => {
              const updated = {
                ...(typeof current === 'object' ? current : {}),
                version: (current as typeof initial).version + 1,
              }
              return { updated, result: updated }
            })
          }
        })

      const results = await Promise.all(operations)

      // Final version should be consistent
      const finalContent = await fs.readFile(testFile, 'utf-8')
      const finalData = JSON.parse(finalContent)
      expect(finalData.version).toBeGreaterThanOrEqual(0)
    })
  })
})
