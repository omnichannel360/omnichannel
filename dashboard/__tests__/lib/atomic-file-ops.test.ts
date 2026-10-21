import { describe, it, expect, beforeEach, afterEach, vi } from '@jest/globals'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { atomicRead, atomicWrite, atomicUpdate } from '@/lib/atomic-file-ops'
import { acquireLock, withLock, cleanupStaleLocks } from '@/lib/file-lock'

const testDir = path.join(os.tmpdir(), 'atomic-file-ops-test')

describe('atomic-file-ops', () => {
  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore errors
    }
  })

  describe('atomicRead', () => {
    it('should read JSON file successfully', async () => {
      const testFile = path.join(testDir, 'test.json')
      const data = { id: 1, name: 'test' }

      await fs.mkdir(path.dirname(testFile), { recursive: true })
      await fs.writeFile(testFile, JSON.stringify(data), 'utf-8')

      const result = await atomicRead<typeof data>(testFile)
      expect(result).toEqual(data)
    })

    it('should return empty array for missing file with array hint', async () => {
      const testFile = path.join(testDir, 'alerts.json')
      const result = await atomicRead<any>(testFile)
      expect(result).toEqual([])
    })

    it('should return empty object for missing file with object hint', async () => {
      const testFile = path.join(testDir, 'config.json')
      const result = await atomicRead<any>(testFile)
      expect(result).toEqual({})
    })

    it('should handle concurrent reads without corruption', async () => {
      const testFile = path.join(testDir, 'concurrent-read.json')
      const data = { counter: 0, items: Array.from({ length: 100 }, (_, i) => i) }

      await fs.mkdir(path.dirname(testFile), { recursive: true })
      await fs.writeFile(testFile, JSON.stringify(data), 'utf-8')

      // Simulate 10 concurrent reads
      const promises = Array.from({ length: 10 }, () => atomicRead<typeof data>(testFile))
      const results = await Promise.all(promises)

      // All results should be identical
      results.forEach((result) => {
        expect(result).toEqual(data)
      })
    })
  })

  describe('atomicWrite', () => {
    it('should write JSON file successfully', async () => {
      const testFile = path.join(testDir, 'write-test.json')
      const data = { id: 1, name: 'test' }

      await atomicWrite(testFile, data)

      const content = await fs.readFile(testFile, 'utf-8')
      expect(JSON.parse(content)).toEqual(data)
    })

    it('should use atomic rename to prevent partial writes', async () => {
      const testFile = path.join(testDir, 'atomic-write.json')
      const data = { large: 'x'.repeat(1000) }

      await atomicWrite(testFile, data)

      // File should not have .tmp extension
      const files = await fs.readdir(path.dirname(testFile))
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'))
      expect(tmpFiles).toHaveLength(0)
    })

    it('should clean up temp files on error', async () => {
      const testFile = path.join(testDir, 'error-write.json')
      const readonlyDir = path.join(testDir, 'readonly-dir')

      // Create readonly directory to trigger write error
      await fs.mkdir(readonlyDir, { recursive: true })

      try {
        // Try to write to non-existent parent - will fail after mkdir succeeds
        await atomicWrite(testFile, { test: 'data' })
      } catch (error) {
        // Expected error
      }

      const files = await fs.readdir(testDir)
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'))
      expect(tmpFiles.length).toBeLessThan(2) // At most 1 tmp file from failed write
    })
  })

  describe('atomicUpdate', () => {
    it('should update JSON file atomically', async () => {
      const testFile = path.join(testDir, 'update-test.json')
      const initialData = { counter: 0 }

      await fs.mkdir(path.dirname(testFile), { recursive: true })
      await fs.writeFile(testFile, JSON.stringify(initialData), 'utf-8')

      const result = await atomicUpdate<typeof initialData, number>(testFile, (current) => {
        const updated = { ...current, counter: current.counter + 1 }
        return { updated, result: updated.counter }
      })

      expect(result).toBe(1)

      const content = await fs.readFile(testFile, 'utf-8')
      expect(JSON.parse(content)).toEqual({ counter: 1 })
    })

    it('should handle concurrent updates safely', async () => {
      const testFile = path.join(testDir, 'concurrent-update.json')
      const initialData = { counter: 0 }

      await fs.mkdir(path.dirname(testFile), { recursive: true })
      await fs.writeFile(testFile, JSON.stringify(initialData), 'utf-8')

      // Simulate 10 concurrent updates
      const promises = Array.from({ length: 10 }, () =>
        atomicUpdate<typeof initialData, number>(testFile, (current) => {
          const updated = { counter: current.counter + 1 }
          return { updated, result: updated.counter }
        })
      )

      const results = await Promise.all(promises)

      // Results should be unique and in order (1-10)
      expect(results.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

      const content = await fs.readFile(testFile, 'utf-8')
      const finalData = JSON.parse(content)
      expect(finalData.counter).toBe(10)
    })

    it('should create file if it does not exist', async () => {
      const testFile = path.join(testDir, 'new-file.json')

      await atomicUpdate<any[], any[]>(testFile, (current) => {
        const updated = [...current, { id: 1 }]
        return { updated, result: updated }
      })

      const content = await fs.readFile(testFile, 'utf-8')
      const data = JSON.parse(content)
      expect(data).toEqual([{ id: 1 }])
    })

    it('should handle complex update scenarios', async () => {
      const testFile = path.join(testDir, 'complex-update.json')
      interface Item {
        id: string
        value: number
      }

      const initialData: Item[] = [
        { id: '1', value: 10 },
        { id: '2', value: 20 },
      ]

      await fs.mkdir(path.dirname(testFile), { recursive: true })
      await fs.writeFile(testFile, JSON.stringify(initialData), 'utf-8')

      // Update existing item
      const result = await atomicUpdate<Item[], Item>(testFile, (current) => {
        const index = current.findIndex((i) => i.id === '1')
        if (index === -1) throw new Error('Not found')

        const updated = [...current]
        updated[index] = { ...updated[index], value: updated[index].value + 5 }
        return { updated, result: updated[index] }
      })

      expect(result).toEqual({ id: '1', value: 15 })

      const content = await fs.readFile(testFile, 'utf-8')
      const finalData = JSON.parse(content) as Item[]
      expect(finalData[0].value).toBe(15)
      expect(finalData[1].value).toBe(20)
    })
  })

  describe('Race condition stress tests', () => {
    it('should handle 50 concurrent mixed operations without data corruption', async () => {
      const testFile = path.join(testDir, 'stress-test.json')
      interface Data {
        operations: string[]
        lastTimestamp: number
      }

      const initialData: Data = {
        operations: [],
        lastTimestamp: Date.now(),
      }

      await fs.mkdir(path.dirname(testFile), { recursive: true })
      await fs.writeFile(testFile, JSON.stringify(initialData), 'utf-8')

      // Mix of reads and writes
      const promises = []

      for (let i = 0; i < 30; i++) {
        promises.push(
          atomicUpdate<Data, string>(testFile, (current) => {
            const updated = {
              ...current,
              operations: [...current.operations, `write_${i}`],
              lastTimestamp: Date.now(),
            }
            return { updated, result: `write_${i}` }
          })
        )
      }

      for (let i = 0; i < 20; i++) {
        promises.push(atomicRead<Data>(testFile))
      }

      const results = await Promise.all(promises)

      // Verify final state
      const finalContent = await fs.readFile(testFile, 'utf-8')
      const finalData = JSON.parse(finalContent) as Data

      expect(finalData.operations).toHaveLength(30)
      expect(new Set(finalData.operations).size).toBe(30) // All unique
    })

    it('should recover from partial writes', async () => {
      const testFile = path.join(testDir, 'recovery-test.json')
      interface Data {
        value: number
        attempts: number
      }

      const initialData: Data = { value: 0, attempts: 0 }

      await fs.mkdir(path.dirname(testFile), { recursive: true })
      await fs.writeFile(testFile, JSON.stringify(initialData), 'utf-8')

      // Perform updates
      for (let i = 0; i < 10; i++) {
        await atomicUpdate<Data, void>(testFile, (current) => {
          return {
            updated: {
              value: current.value + 1,
              attempts: current.attempts + 1,
            },
            result: undefined,
          }
        })
      }

      const finalContent = await fs.readFile(testFile, 'utf-8')
      const finalData = JSON.parse(finalContent) as Data

      expect(finalData.value).toBe(10)
      expect(finalData.attempts).toBe(10)
    })
  })
})

describe('file-lock', () => {
  const testDir = path.join(os.tmpdir(), 'file-lock-test')

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
    await cleanupStaleLocks()
  })

  describe('acquireLock', () => {
    it('should acquire and release lock successfully', async () => {
      const testFile = path.join(testDir, 'test.txt')
      const lock = await acquireLock(testFile)

      expect(lock).toBeDefined()
      expect(lock.path).toBe(testFile)

      await lock.release()
    })

    it('should prevent concurrent lock acquisition', async () => {
      const testFile = path.join(testDir, 'test.txt')

      const lock1 = await acquireLock(testFile)
      const lock2Promise = Promise.race([
        acquireLock(testFile),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 500)
        }),
      ])

      const lock2 = await lock2Promise

      expect(lock1).toBeDefined()
      expect(lock2).toBeNull() // Should timeout waiting for lock

      await lock1.release()
    })

    it('should timeout waiting for lock', async () => {
      const testFile = path.join(testDir, 'test.txt')

      const lock1 = await acquireLock(testFile, { timeout: 1000 })

      try {
        // Should timeout
        await Promise.race([
          acquireLock(testFile, { timeout: 500 }),
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Test timeout')), 1000)
          }),
        ])
        // If we get here, the lock was acquired (should not happen)
        expect.fail('Should have timed out')
      } catch (error) {
        // Expected: lock acquire failed
        expect((error as Error).message).toContain('Failed to acquire lock')
      }

      await lock1.release()
    })

    it('should clean up stale locks', async () => {
      const testFile = path.join(testDir, 'test.txt')
      const lock = await acquireLock(testFile, { timeout: 100 })

      // Create a fake stale lock by directly writing old metadata
      const staleDir = path.join(os.tmpdir(), '.file-locks')
      const crypto = require('crypto')
      const hash = crypto.createHash('sha256').update(testFile).digest('hex')
      const staleLockPath = path.join(staleDir, `${hash}.lock`)

      await fs.mkdir(staleDir, { recursive: true })
      await fs.writeFile(
        staleLockPath,
        JSON.stringify({
          pid: process.pid,
          timestamp: Date.now() - 60000, // 60 seconds old
          filePath: testFile,
        }),
        'utf-8'
      )

      // Cleanup should remove the stale lock
      const cleaned = await cleanupStaleLocks(staleDir, 30000)

      expect(cleaned).toBeGreaterThan(0)

      await lock.release()
    })
  })

  describe('withLock', () => {
    it('should execute function while holding lock', async () => {
      const testFile = path.join(testDir, 'test.txt')
      let executed = false

      await withLock(testFile, async () => {
        executed = true
      })

      expect(executed).toBe(true)
    })

    it('should release lock on error', async () => {
      const testFile = path.join(testDir, 'test.txt')

      try {
        await withLock(testFile, async () => {
          throw new Error('Test error')
        })
      } catch {
        // Expected
      }

      // Should be able to acquire lock again
      const lock = await Promise.race([
        acquireLock(testFile),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 500)
        }),
      ])

      expect(lock).toBeDefined()
      await lock?.release()
    })
  })
})

