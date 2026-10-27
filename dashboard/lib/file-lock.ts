import { createLogger } from '@/lib/logger'

const logger = createLogger('file-lock')

// Default timeout for lock acquisition (prevents indefinite locks)
const DEFAULT_LOCK_TIMEOUT_MS = 30000 // 30 seconds

interface FileLock {
  queue: Array<() => Promise<void>>
  locked: boolean
  lastAccessTime: number
}

const locks = new Map<string, FileLock>()

/**
 * Hand the lock to the next queued callback, or release it when the queue is empty.
 * Must run exactly once per callback that held the lock, including timed-out waiters.
 */
function releaseLock(filePath: string): void {
  const fileLock = locks.get(filePath)

  if (!fileLock) {
    // Should never happen, but log if it does - indicates internal error
    logger.error('Lock was deleted during execution', new Error('Lock deleted'), { filePath })
    return
  }

  fileLock.lastAccessTime = Date.now()
  const nextCallback = fileLock.queue.shift()

  if (nextCallback) {
    // Execute next queued callback asynchronously
    // Errors in queued callbacks are logged but don't prevent remaining callbacks
    void nextCallback().catch((error) => {
      logger.error('Error executing queued callback', error, { filePath })
      // Continue to next callback - do not re-throw
    })
  } else {
    fileLock.locked = false
    // Clean up lock entry when queue is empty to prevent memory leak
    locks.delete(filePath)
  }
}

export async function withFileLock<T>(filePath: string, callback: () => Promise<T>, timeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS): Promise<T> {
  let lock = locks.get(filePath)
  const enqueuedAt = Date.now()

  if (!lock) {
    lock = { queue: [], locked: false, lastAccessTime: Date.now() }
    locks.set(filePath, lock)
  }

  return new Promise<T>((resolve, reject) => {
    // Track if the promise has already settled to prevent double settlement
    let settled = false
    let waitTimer: ReturnType<typeof setTimeout> | undefined

    const acquisitionTimeout = (): Error =>
      new Error(`Lock acquisition timeout after ${timeoutMs}ms for file: ${filePath}`)

    const executeCallback = async (): Promise<void> => {
      if (waitTimer) clearTimeout(waitTimer)

      // Calculate remaining timeout based on when callback was queued
      const elapsedMs = Date.now() - enqueuedAt
      const remainingMs = timeoutMs - elapsedMs

      // Timed out while waiting: skip the callback but still pass the lock on
      if (settled || remainingMs <= 0) {
        if (!settled) {
          settled = true
          reject(acquisitionTimeout())
        }
        releaseLock(filePath)
        return
      }

      let executionTimer: ReturnType<typeof setTimeout> | undefined
      try {
        // Use Promise.race to ensure timeout actually interrupts execution
        // This prevents the race condition where callback continues after timeout
        const timeoutPromise = new Promise<T>((_, rejectTimeout) => {
          executionTimer = setTimeout(() => {
            rejectTimeout(new Error(`Lock execution timeout after ${timeoutMs}ms for file: ${filePath}`))
          }, remainingMs)
        })

        const result = await Promise.race([callback(), timeoutPromise])

        if (!settled) {
          settled = true
          resolve(result)
        }
      } catch (error) {
        if (!settled) {
          settled = true
          reject(error)
        }
      } finally {
        if (executionTimer) clearTimeout(executionTimer)
        releaseLock(filePath)
      }
    }

    // Atomically check and set lock state to prevent race conditions
    if (lock.locked) {
      lock.queue.push(executeCallback)
      // Enforce the acquisition timeout while queued; the entry stays in the queue
      // and releases the lock immediately when its turn comes
      waitTimer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(acquisitionTimeout())
        }
      }, timeoutMs)
    } else {
      lock.locked = true
      // Initiate async execution without awaiting: the Promise will resolve/reject
      // based on the callback's completion, independent of this Promise executor
      void executeCallback()
    }
  })
}

// Alias for backwards compatibility with atomic-dir-ops
export const withLock = withFileLock

/**
 * Clear all locks - used in tests to reset state
 */
export function clearAllLocks(): void {
  locks.clear()
}

/**
 * Get the current number of locks - used for debugging and testing
 */
export function getLockCount(): number {
  return locks.size
}
