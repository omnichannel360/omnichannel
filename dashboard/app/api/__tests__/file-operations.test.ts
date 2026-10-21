import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import { withFileLock, clearAllLocks, getLockCount } from '@/lib/file-lock'
import os from 'os'

// Create temp directory for tests
const tempDir = path.join(os.tmpdir(), 'file-ops-test-' + Date.now())
const testFile = path.join(tempDir, 'test.json')

describe('File Operations - Async I/O', () => {
  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true })
    clearAllLocks()
  })

  afterEach(async () => {
    clearAllLocks()
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // Already cleaned
    }
  })

  describe('File Locking', () => {
    it('should acquire and release locks sequentially', async () => {
      const results: number[] = []

      await withFileLock(testFile, async () => {
        results.push(1)
        await new Promise(resolve => setTimeout(resolve, 10))
        results.push(2)
      })

      expect(results).toEqual([1, 2])
      expect(getLockCount()).toBe(0)
    })

    it('should queue concurrent access', async () => {
      const order: number[] = []

      const p1 = withFileLock(testFile, async () => {
        order.push(1)
        await new Promise(resolve => setTimeout(resolve, 20))
      })

      const p2 = withFileLock(testFile, async () => {
        order.push(2)
      })

      await Promise.all([p1, p2])
      expect(order).toEqual([1, 2])
    })

    it('should handle concurrent writes safely', async () => {
      const writes = Array.from({ length: 5 }, async (_, i) => {
        return withFileLock(testFile, async () => {
          const current = await fs
            .readFile(testFile, 'utf-8')
            .then(data => JSON.parse(data))
            .catch(() => [])

          const updated = [...current, i]
          await fs.writeFile(testFile, JSON.stringify(updated, null, 2), 'utf-8')
        })
      })

      await Promise.all(writes)

      const final = JSON.parse(await fs.readFile(testFile, 'utf-8'))
      expect(final).toEqual([0, 1, 2, 3, 4])
    })

    it('should handle lock errors gracefully', async () => {
      const testError = new Error('Test error')

      try {
        await withFileLock(testFile, async () => {
          throw testError
        })
      } catch (error) {
        expect(error).toEqual(testError)
      }

      // Lock should be released even on error
      expect(getLockCount()).toBe(0)
    })
  })

  describe('Async File Operations', () => {
    it('should read files asynchronously', async () => {
      const testData = { test: true }
      await fs.writeFile(testFile, JSON.stringify(testData), 'utf-8')

      const data = await fs.readFile(testFile, 'utf-8')
      const parsed = JSON.parse(data)

      expect(parsed).toEqual(testData)
    })

    it('should write files asynchronously', async () => {
      const testData = { async: true, timestamp: new Date().toISOString() }
      await fs.writeFile(testFile, JSON.stringify(testData, null, 2), 'utf-8')

      const content = await fs.readFile(testFile, 'utf-8')
      expect(content).toContain('"async": true')
    })

    it('should handle missing files gracefully', async () => {
      try {
        await fs.readFile(testFile, 'utf-8')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error instanceof Error).toBe(true)
      }
    })

    it('should parse JSON safely with error handling', async () => {
      const invalidJson = '{invalid json'
      await fs.writeFile(testFile, invalidJson, 'utf-8')

      const data = await fs.readFile(testFile, 'utf-8')
      expect(() => JSON.parse(data)).toThrow()
    })
  })

  describe('Directory Operations', () => {
    it('should create directories recursively', async () => {
      const nestedDir = path.join(tempDir, 'a', 'b', 'c')
      await fs.mkdir(nestedDir, { recursive: true })

      const stat = await fs.stat(nestedDir)
      expect(stat.isDirectory()).toBe(true)
    })

    it('should handle existing directories', async () => {
      await fs.mkdir(tempDir, { recursive: true })
      // Should not throw
      expect(true).toBe(true)
    })

    it('should list directory contents', async () => {
      const file1 = path.join(tempDir, 'file1.json')
      const file2 = path.join(tempDir, 'file2.json')

      await fs.writeFile(file1, '{}', 'utf-8')
      await fs.writeFile(file2, '{}', 'utf-8')

      const files = await fs.readdir(tempDir)
      expect(files.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Edge Cases', () => {
    it('should handle large JSON files', async () => {
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        data: 'x'.repeat(100),
      }))

      await fs.writeFile(testFile, JSON.stringify(largeData), 'utf-8')
      const content = await fs.readFile(testFile, 'utf-8')
      const parsed = JSON.parse(content)

      expect(parsed.length).toBe(1000)
    })

    it('should handle special characters in JSON', async () => {
      const special = {
        emoji: '🎉',
        unicode: 'A',
        newlines: 'line1\nline2',
        quotes: 'say "hello"',
      }

      await fs.writeFile(testFile, JSON.stringify(special), 'utf-8')
      const content = await fs.readFile(testFile, 'utf-8')
      const parsed = JSON.parse(content)

      expect(parsed.emoji).toBe('🎉')
      expect(parsed.newlines).toBe('line1\nline2')
    })

    it('should handle concurrent reads from same file', async () => {
      const testData = { shared: true }
      await fs.writeFile(testFile, JSON.stringify(testData), 'utf-8')

      const reads = Array.from({ length: 5 }, async () => {
        const data = await fs.readFile(testFile, 'utf-8')
        return JSON.parse(data)
      })

      const results = await Promise.all(reads)
      expect(results).toHaveLength(5)
      expect(results.every(r => r.shared === true)).toBe(true)
    })
  })

  describe('Race Condition Prevention', () => {
    it('should prevent lost updates with high concurrency', async () => {
      // Initialize file with empty array
      await fs.writeFile(testFile, JSON.stringify([]), 'utf-8')

      // Simulate 100 concurrent increment-and-append operations
      const operations = Array.from({ length: 100 }, (_, i) =>
        withFileLock(testFile, async () => {
          const data = JSON.parse(await fs.readFile(testFile, 'utf-8'))
          const updated = [...data, i]
          await fs.writeFile(testFile, JSON.stringify(updated, null, 2), 'utf-8')
        })
      )

      await Promise.all(operations)

      const final = JSON.parse(await fs.readFile(testFile, 'utf-8'))
      // All values should be present, no lost writes
      expect(final).toHaveLength(100)
      expect(final.sort((a: number, b: number) => a - b)).toEqual(
        Array.from({ length: 100 }, (_, i) => i)
      )
    })

    it('should serialize reads and writes correctly', async () => {
      let readValue = 0

      // Write initial value
      await fs.writeFile(testFile, JSON.stringify({ counter: 0 }), 'utf-8')

      const operations = [
        // Multiple writers incrementing
        ...Array.from({ length: 10 }, () =>
          withFileLock(testFile, async () => {
            const data = JSON.parse(await fs.readFile(testFile, 'utf-8'))
            data.counter += 1
            await fs.writeFile(testFile, JSON.stringify(data), 'utf-8')
          })
        ),
        // Multiple readers checking value
        ...Array.from({ length: 5 }, async () =>
          withFileLock(testFile, async () => {
            const data = JSON.parse(await fs.readFile(testFile, 'utf-8'))
            readValue = Math.max(readValue, data.counter)
          })
        ),
      ]

      await Promise.all(operations)

      const final = JSON.parse(await fs.readFile(testFile, 'utf-8'))
      expect(final.counter).toBe(10)
      expect(readValue).toBeLessThanOrEqual(10)
    })

    it('should maintain order under rapid-fire requests', async () => {
      const order: number[] = []
      const numRequests = 50

      const requests = Array.from({ length: numRequests }, (_, i) =>
        withFileLock(testFile, async () => {
          order.push(i)
          // Simulate work
          await new Promise(resolve => setTimeout(resolve, Math.random() * 5))
        })
      )

      await Promise.all(requests)

      // All requests should complete in their original order due to locking
      expect(order).toEqual(Array.from({ length: numRequests }, (_, i) => i))
    })

    it('should handle interleaved reads and writes without data corruption', async () => {
      interface DataItem {
        id: number
        value: string
      }
      const items: DataItem[] = []

      await fs.writeFile(testFile, JSON.stringify(items), 'utf-8')

      const operations = [
        // Writers
        ...Array.from({ length: 20 }, (_, i) =>
          withFileLock(testFile, async () => {
            const data = JSON.parse(await fs.readFile(testFile, 'utf-8')) as DataItem[]
            const updated: DataItem[] = [...data, { id: i, value: `item-${i}` }]
            await fs.writeFile(testFile, JSON.stringify(updated), 'utf-8')
          })
        ),
        // Readers
        ...Array.from({ length: 10 }, async () =>
          withFileLock(testFile, async () => {
            const data = JSON.parse(await fs.readFile(testFile, 'utf-8')) as DataItem[]
            expect(Array.isArray(data)).toBe(true)
            // Validate all items have required fields
            for (const item of data) {
              expect(typeof item.id).toBe('number')
              expect(typeof item.value).toBe('string')
            }
          })
        ),
      ]

      await Promise.all(operations)

      const final = JSON.parse(await fs.readFile(testFile, 'utf-8')) as DataItem[]
      expect(final).toHaveLength(20)
      expect(final.every(item => typeof item.id === 'number')).toBe(true)
    })

    it('should prevent race conditions in read-modify-write cycles', async () => {
      interface Counter {
        value: number
      }

      const counter: Counter = { value: 0 }
      await fs.writeFile(testFile, JSON.stringify(counter), 'utf-8')

      // Simulate: read counter, increment, write back
      // Without proper locking, this would lose updates
      const operations = Array.from({ length: 50 }, async () =>
        withFileLock(testFile, async () => {
          const data = JSON.parse(await fs.readFile(testFile, 'utf-8')) as Counter
          // Small delay to increase chance of race condition if not locked
          await new Promise(resolve => setTimeout(resolve, 1))
          data.value += 1
          await fs.writeFile(testFile, JSON.stringify(data), 'utf-8')
        })
      )

      await Promise.all(operations)

      const final = JSON.parse(await fs.readFile(testFile, 'utf-8')) as Counter
      expect(final.value).toBe(50) // All increments should be preserved
    })
  })
})
