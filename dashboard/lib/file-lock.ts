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

    const executeCallback = async (): Promise<void> => {
      // Calculate remaining timeout based on when callback was queued
      const elapsedMs = Date.now() - enqueuedAt
      const remainingMs = timeoutMs - elapsedMs

      // If timeout already exceeded while waiting in queue, reject without executing
      if (remainingMs <= 0) {
        if (!settled) {
          settled = true
          reject(new Error(`Lock acquisition timeout after ${timeoutMs}ms for file: ${filePath}`))
        }
        return
      }

      try {
        // Use Promise.race to ensure timeout actually interrupts execution
        // This prevents the race condition where callback continues after timeout
        const timeoutPromise = new Promise<T>((_, reject) =>
          setTimeout(() => {
            reject(new Error(`Lock execution timeout after ${timeoutMs}ms for file: ${filePath}`))
          }, remainingMs)
        )

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
        // Lock is guaranteed to exist: created above or retrieved from map
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
          if (fileLock.queue.length === 0) {
            locks.delete(filePath)
          }
        }
      }
    }

    // Atomically check and set lock state to prevent race conditions
    if (lock.locked) {
      lock.queue.push(executeCallback)
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
