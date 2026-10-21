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
})
