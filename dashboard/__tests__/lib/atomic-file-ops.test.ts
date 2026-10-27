import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { atomicRead, atomicWrite, atomicUpdate } from '@/lib/atomic-file-ops'
import { withFileLock, withLock, clearAllLocks, getLockCount } from '@/lib/file-lock'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('atomic-file-ops', () => {
  let testDir: string

  beforeEach(async () => {
    clearAllLocks()
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-test-'))
  })

  afterEach(async () => {
    clearAllLocks()
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('atomicRead', () => {
    it('should read JSON file successfully', async () => {
      const testFile = path.join(testDir, 'test.json')
      const data = { id: 1, name: 'test' }

      await fs.writeFile(testFile, JSON.stringify(data), 'utf-8')

      const result = await atomicRead<typeof data>(testFile)
      expect(result).toEqual(data)
    })

    it('should return empty array fallback for missing file', async () => {
      const testFile = path.join(testDir, 'alerts.json')
      const result = await atomicRead<unknown[]>(testFile, [])
      expect(result).toEqual([])
    })

    it('should return empty object fallback for missing file', async () => {
      const testFile = path.join(testDir, 'config.json')
      const result = await atomicRead<Record<string, unknown>>(testFile, {})
      expect(result).toEqual({})
    })

    it('should handle concurrent reads without corruption', async () => {
      const testFile = path.join(testDir, 'concurrent-read.json')
      const data = { counter: 0, items: Array.from({ length: 100 }, (_, i) => i) }

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
      expect(JSON.parse(await fs.readFile(testFile, 'utf-8'))).toEqual(data)
    })

    it('should clean up temp files on error', async () => {
      const testFile = path.join(testDir, 'error-write.json')

      // Circular structure cannot be serialized -> write must fail
      const circular: Record<string, unknown> = { test: 'data' }
      circular.self = circular

      await expect(atomicWrite(testFile, circular)).rejects.toThrow('Failed to serialize data to JSON')

      const files = await fs.readdir(testDir)
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'))
      expect(tmpFiles).toHaveLength(0)
      // No partial target file left behind
      expect(files).not.toContain('error-write.json')
      expect(getLockCount()).toBe(0)
    })
  })

  describe('atomicUpdate', () => {
    it('should update JSON file atomically', async () => {
      const testFile = path.join(testDir, 'update-test.json')
      const initialData = { counter: 0 }

      await fs.writeFile(testFile, JSON.stringify(initialData), 'utf-8')

      const result = await atomicUpdate<typeof initialData>(
        testFile,
        (current) => ({ ...current, counter: current.counter + 1 }),
        { counter: 0 }
      )

      expect(result.counter).toBe(1)

      const content = await fs.readFile(testFile, 'utf-8')
      expect(JSON.parse(content)).toEqual({ counter: 1 })
    })

    it('should handle concurrent updates safely', async () => {
      const testFile = path.join(testDir, 'concurrent-update.json')
      const initialData = { counter: 0 }

      await fs.writeFile(testFile, JSON.stringify(initialData), 'utf-8')

      // Simulate 10 concurrent updates
      const promises = Array.from({ length: 10 }, () =>
        atomicUpdate<typeof initialData>(testFile, (current) => ({ counter: current.counter + 1 }), { counter: 0 })
      )

      const results = await Promise.all(promises)

      // Results should be unique and in order (1-10)
      expect(results.map((r) => r.counter).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

      const content = await fs.readFile(testFile, 'utf-8')
      const finalData = JSON.parse(content)
      expect(finalData.counter).toBe(10)
    })

    it('should create file if it does not exist', async () => {
      const testFile = path.join(testDir, 'new-file.json')

      await atomicUpdate<Array<{ id: number }>>(testFile, (current) => [...current, { id: 1 }], [])

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

      await fs.writeFile(testFile, JSON.stringify(initialData), 'utf-8')

      // Update existing item
      const result = await atomicUpdate<Item[]>(
        testFile,
        (current) => {
          const index = current.findIndex((i) => i.id === '1')
          if (index === -1) throw new Error('Not found')

          return current.map((item, i) => (i === index ? { ...item, value: item.value + 5 } : item))
        },
        []
      )

      expect(result[0]).toEqual({ id: '1', value: 15 })

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

      await fs.writeFile(testFile, JSON.stringify(initialData), 'utf-8')

      // Mix of reads and writes
      const promises: Promise<unknown>[] = []

      for (let i = 0; i < 30; i++) {
        promises.push(
          atomicUpdate<Data>(
            testFile,
            (current) => ({
              ...current,
              operations: [...current.operations, `write_${i}`],
              lastTimestamp: Date.now(),
            }),
            initialData
          )
        )
      }

      for (let i = 0; i < 20; i++) {
        promises.push(atomicRead<Data>(testFile))
      }

      await Promise.all(promises)

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

      await fs.writeFile(testFile, JSON.stringify(initialData), 'utf-8')

      // Perform updates
      for (let i = 0; i < 10; i++) {
        await atomicUpdate<Data>(
          testFile,
          (current) => ({
            value: current.value + 1,
            attempts: current.attempts + 1,
          }),
          initialData
        )
      }

      const finalContent = await fs.readFile(testFile, 'utf-8')
      const finalData = JSON.parse(finalContent) as Data

      expect(finalData.value).toBe(10)
      expect(finalData.attempts).toBe(10)
    })
  })
})

describe('file-lock', () => {
  let testDir: string

  beforeEach(async () => {
    clearAllLocks()
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-test-'))
  })

  afterEach(async () => {
    clearAllLocks()
    await fs.rm(testDir, { recursive: true, force: true })
  })

  /** Holds the lock on filePath until release() is called. */
  async function holdLock(filePath: string): Promise<{ release: () => void; done: Promise<void> }> {
    let signalAcquired!: () => void
    let release!: () => void
    const acquired = new Promise<void>((r) => {
      signalAcquired = r
    })
    const held = new Promise<void>((r) => {
      release = r
    })
    const done = withFileLock(filePath, async () => {
      signalAcquired()
      await held
    })
    await acquired
    return { release, done }
  }

  describe('withFileLock acquisition', () => {
    it('should acquire and release lock successfully', async () => {
      const testFile = path.join(testDir, 'test.txt')

      const result = await withFileLock(testFile, async () => {
        expect(getLockCount()).toBe(1)
        return 'locked'
      })

      expect(result).toBe('locked')
      expect(getLockCount()).toBe(0)
    })

    it('should prevent concurrent lock acquisition', async () => {
      const testFile = path.join(testDir, 'test.txt')

      const holder = await holdLock(testFile)
      let secondRan = false
      const second = withFileLock(testFile, async () => {
        secondRan = true
      })

      const outcome = await Promise.race([second.then(() => 'acquired'), sleep(500).then(() => null)])

      expect(outcome).toBeNull() // Should still be waiting for lock
      expect(secondRan).toBe(false)

      holder.release()
      await Promise.all([holder.done, second])
      expect(secondRan).toBe(true)
    })

    it('should timeout waiting for lock', async () => {
      const testFile = path.join(testDir, 'test.txt')

      const holder = await holdLock(testFile)

      // Waiter with a 500ms acquisition timeout; holder keeps the lock throughout
      const waiter = withFileLock(testFile, async () => 'acquired', 500)
      const settled = waiter.then(
        (value) => value,
        (error: Error) => error
      )

      const outcome = await Promise.race([settled, sleep(1000).then(() => new Error('Test timeout'))])

      holder.release()
      await holder.done
      await settled

      // Expected: lock acquire failed before the test guard fired
      expect(outcome).toBeInstanceOf(Error)
      expect((outcome as Error).message).toContain('Lock acquisition timeout')
    })

    it('should clean up stale locks', async () => {
      const testFile = path.join(testDir, 'test.txt')

      // Holder that never releases on its own simulates a stale lock
      const stale = await holdLock(testFile)
      expect(getLockCount()).toBe(1)

      // Cleanup should remove the stale lock
      clearAllLocks()
      expect(getLockCount()).toBe(0)

      const outcome = await Promise.race([
        withFileLock(testFile, async () => 'acquired', 1000),
        sleep(500).then(() => 'blocked'),
      ])
      expect(outcome).toBe('acquired')

      stale.release()
      await stale.done
    })
  })

  describe('withLock', () => {
    it('should execute function while holding lock', async () => {
      const testFile = path.join(testDir, 'test.txt')
      let executed = false

      await withLock(testFile, async () => {
        executed = true
        expect(getLockCount()).toBe(1)
      })

      expect(executed).toBe(true)
    })

    it('should release lock on error', async () => {
      const testFile = path.join(testDir, 'test.txt')

      await expect(
        withLock(testFile, async () => {
          throw new Error('Test error')
        })
      ).rejects.toThrow('Test error')

      expect(getLockCount()).toBe(0)

      // Should be able to acquire lock again
      const outcome = await Promise.race([
        withLock(testFile, async () => 'acquired'),
        sleep(500).then(() => null),
      ])

      expect(outcome).toBe('acquired')
    })
  })
})
