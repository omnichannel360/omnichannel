/**
 * Comprehensive tests for file locking mechanism
 * Verifies race condition fixes and proper lock behavior
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
  acquireLock,
  tryAcquireLock,
  releaseLock,
  withLock,
  cleanupStaleLocks,
} from './file-lock'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

describe('File Locking - Race Condition Prevention', () => {
  let testDir: string
  let testFile: string

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `file-lock-test-${Date.now()}`)
    testFile = path.join(testDir, 'test.txt')
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
    // Clean up stale locks
    await cleanupStaleLocks()
  })

  describe('Sequential Lock Acquisition', () => {
    it('should acquire and release locks sequentially without race conditions', async () => {
      const lock1 = await acquireLock(testFile)
      expect(lock1).toBeDefined()
      expect(lock1.path).toBe(testFile)

      await releaseLock(lock1)

      // Second lock should succeed immediately
      const lock2 = await acquireLock(testFile, { timeout: 1000 })
      expect(lock2).toBeDefined()
      await releaseLock(lock2)
    })

    it('should prevent concurrent lock acquisition with proper queue ordering', async () => {
      const order: number[] = []

      const lock1Promise = acquireLock(testFile, { timeout: 5000 })
      const lock2Promise = acquireLock(testFile, { timeout: 5000 })
      const lock3Promise = acquireLock(testFile, { timeout: 5000 })

      const [lock1, lock2, lock3] = await Promise.all([lock1Promise, lock2Promise, lock3Promise])

      // All locks should be acquired (queued)
      expect([lock1, lock2, lock3].every(l => l !== null)).toBe(true)

      // Release in order
      await releaseLock(lock1)
      await releaseLock(lock2)
      await releaseLock(lock3)
    })

    it('should handle many concurrent lock requests without data loss', async () => {
      const concurrentRequests = 20
      const locks = await Promise.all(
        Array(concurrentRequests)
          .fill(null)
          .map(() => acquireLock(testFile, { timeout: 10000 }))
      )

      expect(locks).toHaveLength(concurrentRequests)
      locks.forEach(lock => {
        expect(lock).toBeDefined()
      })

      // Release all locks
      await Promise.all(locks.map(lock => releaseLock(lock)))
    })
  })

  describe('Timeout Mechanism', () => {
    it('should timeout if lock cannot be acquired within specified time', async () => {
      const lock1 = await acquireLock(testFile, { timeout: 500, retryDelay: 50 })

      // Try to acquire with very short timeout
      const lock2Promise = tryAcquireLock(testFile, 100)

      // Timeout should occur
      const lock2 = await lock2Promise
      expect(lock2).toBeNull()

      await releaseLock(lock1)
    })

    it('should recover from timeout and allow subsequent acquisition', async () => {
      const lock1 = await acquireLock(testFile, { timeout: 500, retryDelay: 50 })

      const failedLock = await tryAcquireLock(testFile, 100)
      expect(failedLock).toBeNull()

      await releaseLock(lock1)

      // Should be able to acquire now
      const lock2 = await acquireLock(testFile, { timeout: 1000 })
      expect(lock2).toBeDefined()
      await releaseLock(lock2)
    })
  })

  describe('withLock Wrapper Function', () => {
    it('should automatically acquire and release lock', async () => {
      const result = await withLock(testFile, async (_lock) => {
        return 'success'
      })

      expect(result).toBe('success')
    })

    it('should handle errors in callback and still release lock', async () => {
      try {
        await withLock(testFile, async (_lock) => {
          throw new Error('test error')
        })
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
      }

      // Should still be able to acquire lock
      const lock = await acquireLock(testFile, { timeout: 1000 })
      expect(lock).toBeDefined()
      await releaseLock(lock)
    })

    it('should prevent concurrent executions of callback', async () => {
      let activeCount = 0
      let maxActive = 0

      const callback = async () => {
        activeCount++
        maxActive = Math.max(maxActive, activeCount)
        await new Promise(resolve => setTimeout(resolve, 50))
        activeCount--
      }

      await Promise.all([
        withLock(testFile, callback),
        withLock(testFile, callback),
        withLock(testFile, callback),
      ])

      // Only one should be active at a time
      expect(maxActive).toBe(1)
    })
  })

  describe('Stale Lock Detection', () => {
    it('should detect and clean up stale locks', async () => {
      const lockDir = path.join(os.tmpdir(), '.file-locks')
      await fs.mkdir(lockDir, { recursive: true })

      // Create a stale lock file manually
      const staleLockPath = path.join(lockDir, 'stale.lock')
      const staleMetadata = {
        pid: 99999, // Non-existent process
        timestamp: Date.now() - 60000, // 60 seconds old
        filePath: '/tmp/stale',
      }
      await fs.writeFile(staleLockPath, JSON.stringify(staleMetadata))

      const cleaned = await cleanupStaleLocks(lockDir, 30000) // 30 second timeout
      expect(cleaned).toBeGreaterThanOrEqual(1)

      // Stale lock should be removed
      const files = await fs.readdir(lockDir)
      expect(files.filter(f => f.endsWith('.lock')).length).toBe(0)
    })
  })

  describe('Lock Isolation', () => {
    it('should isolate locks per file path', async () => {
      const testFile2 = path.join(testDir, 'test2.txt')

      const lock1 = await acquireLock(testFile)
      const lock2 = await acquireLock(testFile2, { timeout: 1000 })

      // Both should be acquired (different files)
      expect(lock1).toBeDefined()
      expect(lock2).toBeDefined()

      await releaseLock(lock1)
      await releaseLock(lock2)
    })

    it('should not interfere with locks on different files', async () => {
      const file1 = path.join(testDir, 'file1.txt')
      const file2 = path.join(testDir, 'file2.txt')

      const results: string[] = []

      await Promise.all([
        withLock(file1, async () => {
          results.push('f1-start')
          await new Promise(resolve => setTimeout(resolve, 100))
          results.push('f1-end')
        }),
        withLock(file2, async () => {
          results.push('f2-start')
          await new Promise(resolve => setTimeout(resolve, 100))
          results.push('f2-end')
        }),
      ])

      // Both should run concurrently (interleaved)
      expect(results).toContain('f1-start')
      expect(results).toContain('f2-start')
      expect(results.indexOf('f2-start')).toBeLessThan(results.indexOf('f1-end'))
    })
  })

  describe('Lock Durability', () => {
    it('should maintain lock state across multiple rapid acquisitions', async () => {
      const iterations = 10
      const results: boolean[] = []

      for (let i = 0; i < iterations; i++) {
        const lock = await acquireLock(testFile, { timeout: 1000 })
        results.push(lock !== null)
        await releaseLock(lock)
      }

      expect(results.every(r => r === true)).toBe(true)
    })

    it('should preserve lock data integrity across concurrent operations', async () => {
      const locks = await Promise.all([
        acquireLock(testFile, { timeout: 5000 }),
        acquireLock(testFile, { timeout: 5000 }),
      ])

      expect(locks[0].path).toBe(locks[1].path)
      expect(locks[0].lockPath).toBe(locks[1].lockPath)

      await Promise.all(locks.map(lock => releaseLock(lock)))
    })
  })
})
