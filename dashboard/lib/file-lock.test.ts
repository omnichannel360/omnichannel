/**
 * Comprehensive tests for file locking mechanism
 * Verifies race condition fixes and proper lock behavior
 *
 * The lock is an in-process, per-path FIFO queue (see lib/file-lock.ts):
 * withFileLock / withLock serialize callbacks per path, clearAllLocks resets
 * all lock state, getLockCount reports the number of live lock entries.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { withFileLock, withLock, clearAllLocks, getLockCount } from './file-lock'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

function createDeferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Holds the lock on filePath until the returned release() is called. */
async function holdLock(filePath: string): Promise<{ release: () => void; done: Promise<void> }> {
  const acquired = createDeferred()
  const held = createDeferred()
  const done = withFileLock(filePath, async () => {
    acquired.resolve()
    await held.promise
  })
  await acquired.promise
  return { release: held.resolve, done }
}

describe('File Locking - Race Condition Prevention', () => {
  let testDir: string
  let testFile: string

  beforeEach(async () => {
    clearAllLocks()
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-test-'))
    testFile = path.join(testDir, 'test.txt')
  })

  afterEach(async () => {
    clearAllLocks()
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('Sequential Lock Acquisition', () => {
    it('should acquire and release locks sequentially without race conditions', async () => {
      const first = await withFileLock(testFile, async () => {
        expect(getLockCount()).toBe(1)
        return 'first'
      })
      expect(first).toBe('first')
      expect(getLockCount()).toBe(0)

      // Second lock should succeed immediately
      const second = await withFileLock(testFile, async () => 'second', 1000)
      expect(second).toBe('second')
      expect(getLockCount()).toBe(0)
    })

    it('should prevent concurrent lock acquisition with proper queue ordering', async () => {
      const order: string[] = []
      const makeCallback = (id: number) => async (): Promise<void> => {
        order.push(`start-${id}`)
        await sleep(20)
        order.push(`end-${id}`)
      }

      await Promise.all([
        withFileLock(testFile, makeCallback(1), 5000),
        withFileLock(testFile, makeCallback(2), 5000),
        withFileLock(testFile, makeCallback(3), 5000),
      ])

      // FIFO order, no overlap
      expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2', 'start-3', 'end-3'])
      expect(getLockCount()).toBe(0)
    })

    it('should handle many concurrent lock requests without data loss', async () => {
      const concurrentRequests = 20
      let counter = 0

      const results = await Promise.all(
        Array.from({ length: concurrentRequests }, () =>
          withFileLock(
            testFile,
            async () => {
              // Read-yield-write: loses updates unless calls are serialized
              const current = counter
              await sleep(1)
              counter = current + 1
              return counter
            },
            10000
          )
        )
      )

      expect(results).toHaveLength(concurrentRequests)
      expect(counter).toBe(concurrentRequests)
      expect([...results].sort((a, b) => a - b)).toEqual(
        Array.from({ length: concurrentRequests }, (_, i) => i + 1)
      )
      expect(getLockCount()).toBe(0)
    })
  })

  describe('Timeout Mechanism', () => {
    it('should timeout if lock cannot be acquired within specified time', async () => {
      const holder = await holdLock(testFile)
      let waiterRan = false

      // Waiter with a 100ms acquisition timeout while the lock is still held
      const waiter = withFileLock(
        testFile,
        async () => {
          waiterRan = true
        },
        100
      ).then(
        () => 'acquired' as const,
        (error: Error) => error
      )

      const outcome = await Promise.race([waiter, sleep(1000).then(() => 'still-waiting' as const)])

      holder.release()
      await holder.done
      await waiter

      // Timeout should occur while the holder still owns the lock
      expect(outcome).toBeInstanceOf(Error)
      expect((outcome as Error).message).toContain('Lock acquisition timeout')
      expect(waiterRan).toBe(false)
    })

    it('should recover from timeout and allow subsequent acquisition', async () => {
      const holder = await holdLock(testFile)
      let waiterRan = false

      const waiter = withFileLock(
        testFile,
        async () => {
          waiterRan = true
        },
        100
      )
      const waiterResult = waiter.catch((error: Error) => error)

      await sleep(200)
      holder.release()
      await holder.done

      const failure = await waiterResult
      expect(failure).toBeInstanceOf(Error)
      expect((failure as Error).message).toContain('Lock acquisition timeout')
      expect(waiterRan).toBe(false)
      expect(getLockCount()).toBe(0)

      // Should be able to acquire now
      const result = await withFileLock(testFile, async () => 'reacquired', 1000)
      expect(result).toBe('reacquired')
      expect(getLockCount()).toBe(0)
    })
  })

  describe('withLock Wrapper Function', () => {
    it('should automatically acquire and release lock', async () => {
      const result = await withLock(testFile, async () => {
        expect(getLockCount()).toBe(1)
        return 'success'
      })

      expect(result).toBe('success')
      expect(getLockCount()).toBe(0)
    })

    it('should handle errors in callback and still release lock', async () => {
      await expect(
        withLock(testFile, async () => {
          throw new Error('test error')
        })
      ).rejects.toThrow('test error')

      expect(getLockCount()).toBe(0)

      // Should still be able to acquire lock
      const result = await withLock(testFile, async () => 'after-error', 1000)
      expect(result).toBe('after-error')
    })

    it('should prevent concurrent executions of callback', async () => {
      let activeCount = 0
      let maxActive = 0

      const callback = async (): Promise<void> => {
        activeCount++
        maxActive = Math.max(maxActive, activeCount)
        await sleep(50)
        activeCount--
      }

      await Promise.all([withLock(testFile, callback), withLock(testFile, callback), withLock(testFile, callback)])

      // Only one should be active at a time
      expect(maxActive).toBe(1)
    })
  })

  describe('Stale Lock Detection', () => {
    it('should detect and clean up stale locks', async () => {
      const staleFile = path.join(testDir, 'stale.txt')

      // A holder that never releases on its own simulates a stale lock
      const stale = await holdLock(staleFile)
      expect(getLockCount()).toBe(1)

      clearAllLocks()
      expect(getLockCount()).toBe(0)

      // Path is usable again despite the stale holder
      const outcome = await Promise.race([
        withFileLock(staleFile, async () => 'acquired', 1000),
        sleep(500).then(() => 'blocked'),
      ])
      expect(outcome).toBe('acquired')
      expect(getLockCount()).toBe(0)

      stale.release()
      await stale.done
    })
  })

  describe('Lock Isolation', () => {
    it('should isolate locks per file path', async () => {
      const testFile2 = path.join(testDir, 'test2.txt')

      const holder = await holdLock(testFile)

      // Different file should be acquirable while the first is held
      const outcome = await Promise.race([
        withFileLock(
          testFile2,
          async () => {
            expect(getLockCount()).toBe(2)
            return 'acquired'
          },
          1000
        ),
        sleep(500).then(() => 'blocked'),
      ])
      expect(outcome).toBe('acquired')

      holder.release()
      await holder.done
      expect(getLockCount()).toBe(0)
    })

    it('should not interfere with locks on different files', async () => {
      const file1 = path.join(testDir, 'file1.txt')
      const file2 = path.join(testDir, 'file2.txt')

      const results: string[] = []

      await Promise.all([
        withLock(file1, async () => {
          results.push('f1-start')
          await sleep(100)
          results.push('f1-end')
        }),
        withLock(file2, async () => {
          results.push('f2-start')
          await sleep(100)
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
        const acquired = await withFileLock(testFile, async () => true, 1000)
        results.push(acquired)
        expect(getLockCount()).toBe(0)
      }

      expect(results).toHaveLength(iterations)
      expect(results.every((r) => r === true)).toBe(true)
    })

    it('should preserve lock data integrity across concurrent operations', async () => {
      const holder = await holdLock(testFile)
      let queuedRan = false

      const queued = withFileLock(
        testFile,
        async () => {
          queuedRan = true
        },
        5000
      )

      // Both operations share a single lock entry for the same path
      expect(getLockCount()).toBe(1)
      await sleep(50)
      expect(queuedRan).toBe(false)

      holder.release()
      await Promise.all([holder.done, queued])

      expect(queuedRan).toBe(true)
      expect(getLockCount()).toBe(0)
    })
  })
})
