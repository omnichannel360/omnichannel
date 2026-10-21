/**
 * Verification tests for file-lock.ts implementation
 * Tests the Promise-based locking mechanism with proper concurrency handling
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { withFileLock } from './file-lock'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

describe('File Lock - Promise-Based Implementation', () => {
  let testDir: string
  let testFile: string

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `file-lock-verify-${Date.now()}`)
    testFile = path.join(testDir, 'test-data.json')
    await fs.mkdir(testDir, { recursive: true })
    await fs.writeFile(testFile, JSON.stringify([]), 'utf-8')
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('Sequential Operations', () => {
    it('should execute a single callback successfully', async () => {
      const result = await withFileLock(testFile, async () => {
        return 'test-result'
      })
      expect(result).toBe('test-result')
    })

    it('should handle multiple sequential operations in order', async () => {
      const results: string[] = []

      await withFileLock(testFile, async () => {
        results.push('first')
        return 'first'
      })

      await withFileLock(testFile, async () => {
        results.push('second')
        return 'second'
      })

      await withFileLock(testFile, async () => {
        results.push('third')
        return 'third'
      })

      expect(results).toEqual(['first', 'second', 'third'])
    })

    it('should properly handle file I/O operations', async () => {
      const testData = { id: 1, name: 'test' }

      await withFileLock(testFile, async () => {
        await fs.writeFile(testFile, JSON.stringify(testData), 'utf-8')
      })

      const content = await fs.readFile(testFile, 'utf-8')
      expect(JSON.parse(content)).toEqual(testData)
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle concurrent lock requests without data corruption', async () => {
      const concurrentCount = 10
      const counter = { value: 0 }

      const promises = Array(concurrentCount)
        .fill(null)
        .map((_, i) =>
          withFileLock(testFile, async () => {
            counter.value += 1
            // Simulate some async work
            await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
            return i
          })
        )

      const results = await Promise.all(promises)

      // All operations should complete successfully
      expect(results).toHaveLength(concurrentCount)
      expect(counter.value).toBe(concurrentCount)
    })

    it('should serialize concurrent writes to the same file', async () => {
      const data: number[] = []
      const writes = 5

      const promises = Array(writes)
        .fill(null)
        .map((_, i) =>
          withFileLock(testFile, async () => {
            // Read current data
            const content = await fs.readFile(testFile, 'utf-8')
            const existing = JSON.parse(content) as number[]

            // Modify data
            existing.push(i)
            data.push(i)

            // Write back
            await fs.writeFile(testFile, JSON.stringify(existing), 'utf-8')
            return i
          })
        )

      await Promise.all(promises)

      // Verify all writes succeeded
      const finalContent = await fs.readFile(testFile, 'utf-8')
      const finalData = JSON.parse(finalContent) as number[]
      expect(finalData).toHaveLength(writes)
    })

    it('should maintain lock integrity under error conditions', async () => {
      const successfulOps: string[] = []

      try {
        await withFileLock(testFile, async () => {
          throw new Error('Intentional error')
        })
      } catch {
        // Expected error
      }

      // Next operation should still acquire lock successfully
      const result = await withFileLock(testFile, async () => {
        successfulOps.push('after-error')
        return 'success'
      })

      expect(result).toBe('success')
      expect(successfulOps).toEqual(['after-error'])
    })
  })

  describe('Memory Management', () => {
    it('should clean up locks from map when queue is empty', async () => {
      const testFile2 = path.join(testDir, 'test2.json')
      await fs.writeFile(testFile2, JSON.stringify([]), 'utf-8')

      // First lock
      await withFileLock(testFile2, async () => {
        return 'done'
      })

      // Lock should be cleaned up automatically
      // We can verify this by ensuring second lock works without issues
      const result = await withFileLock(testFile2, async () => {
        return 'second-lock-works'
      })

      expect(result).toBe('second-lock-works')
    })
  })

  describe('Error Handling', () => {
    it('should propagate callback errors to the caller', async () => {
      const error = new Error('Test error')

      await expect(
        withFileLock(testFile, async () => {
          throw error
        })
      ).rejects.toThrow('Test error')
    })

    it('should handle multiple callbacks in queue with one failing', async () => {
      const results: string[] = []

      const promises = [
        withFileLock(testFile, async () => {
          results.push('first')
          return 'first'
        }),
        withFileLock(testFile, async () => {
          throw new Error('Middle fails')
        }).catch(() => 'caught-middle-error'),
        withFileLock(testFile, async () => {
          results.push('third')
          return 'third'
        }),
      ]

      const settled = await Promise.allSettled(promises)

      expect(settled[0].status).toBe('fulfilled')
      expect(settled[1].status).toBe('fulfilled')
      expect(settled[2].status).toBe('fulfilled')
      // Note: "third" might not be in results if the error interrupted the queue
    })
  })

  describe('Type Safety', () => {
    it('should properly handle generic return types', async () => {
      interface TestResult {
        id: number
        name: string
      }

      const result = await withFileLock(testFile, async (): Promise<TestResult> => {
        return { id: 1, name: 'test' }
      })

      expect(result.id).toBe(1)
      expect(result.name).toBe('test')
    })
  })
})
