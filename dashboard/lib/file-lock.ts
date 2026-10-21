import { createLogger } from '@/lib/logger'

const logger = createLogger('file-lock')

interface FileLock {
  queue: Array<() => Promise<void>>
  locked: boolean
}

const locks = new Map<string, FileLock>()

export async function withFileLock<T>(filePath: string, callback: () => Promise<T>): Promise<T> {
  let lock = locks.get(filePath)

  if (!lock) {
    lock = { queue: [], locked: false }
    locks.set(filePath, lock)
  }

  return new Promise<T>((resolve, reject) => {
    let callbackPromise: Promise<void> | null = null
    const executeCallback = async (): Promise<void> => {
      try {
        const result = await callback()
        resolve(result)
      } catch (error) {
        reject(error)
      } finally {
        // Lock is guaranteed to exist: it was either retrieved or just created above
        const fileLock = locks.get(filePath)
        if (!fileLock) {
          // Safety check: should never happen, but log if lock was deleted unexpectedly
          logger.error('Lock was deleted during execution', new Error('Lock deleted'), { filePath })
          return
        }

        const nextCallback = fileLock.queue.shift()
        if (nextCallback) {
          // Execute next queued callback and track the promise
          callbackPromise = nextCallback().catch((error) => {
            logger.error('Error executing queued callback', error, { filePath })
            // Continue to next callback instead of stopping
            return Promise.resolve()
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
      callbackPromise = executeCallback()
    }
  })
}

// Alias for backwards compatibility with atomic-dir-ops
export const withLock = withFileLock
