import { promises as fs } from 'fs'
import path from 'path'
import { withLock, Lock } from './file-lock'

interface AtomicUpdateResult<T, R> {
  updated: T
  result: R
}

const ATOMIC_LOCK_TIMEOUT = 30000 // 30 seconds

/**
 * Read a JSON file atomically.
 * Acquires a lock to ensure consistent read and prevent partial reads.
 */
export async function atomicRead<T>(filePath: string): Promise<T> {
  return withLock(
    filePath,
    async () => {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(content) as T
      } catch (error) {
        // File doesn't exist, return empty array or object
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          // Determine default based on file path hints
          if (filePath.includes('alerts') || filePath.includes('tasks') || filePath.includes('logs')) {
            return [] as T
          }
          return {} as T
        }
        throw error
      }
    },
    { timeout: ATOMIC_LOCK_TIMEOUT }
  )
}

/**
 * Write a JSON file atomically.
 * Acquires a lock, writes to a temporary file, then atomically renames it.
 * This ensures the file is never in a partially-written state.
 */
export async function atomicWrite<T>(filePath: string, data: T): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  return withLock(
    filePath,
    async () => {
      // Write to temporary file first
      const tempPath = `${filePath}.tmp`

      try {
        const content = JSON.stringify(data, null, 2)
        await fs.writeFile(tempPath, content, 'utf-8')

        // Atomic rename: move temp file to actual location
        // On POSIX systems, rename is atomic
        await fs.rename(tempPath, filePath)
      } catch (error) {
        // Clean up temp file on error
        try {
          await fs.rm(tempPath, { force: true })
        } catch {
          // Ignore cleanup errors
        }
        throw error
      }
    },
    { timeout: ATOMIC_LOCK_TIMEOUT }
  )
}

/**
 * Atomically update a JSON file.
 * Acquires a lock, reads the current content, applies the update function,
 * writes the new content, and releases the lock. All in one critical section.
 *
 * The update function receives the current data and must return an object with:
 * - updated: The new data to write
 * - result: The value to return from atomicUpdate
 */
export async function atomicUpdate<T, R>(
  filePath: string,
  updateFn: (current: T) => Promise<AtomicUpdateResult<T, R>> | AtomicUpdateResult<T, R>
): Promise<R> {
  // Ensure directory exists
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  return withLock(
    filePath,
    async () => {
      // Read current content
      let current: T
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        current = JSON.parse(content) as T
      } catch (error) {
        // File doesn't exist, start with empty array or object
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          if (filePath.includes('alerts') || filePath.includes('tasks') || filePath.includes('logs')) {
            current = [] as T
          } else {
            current = {} as T
          }
        } else {
          throw error
        }
      }

      // Apply update function
      const result = await Promise.resolve(updateFn(current))

      // Write new content atomically
      const tempPath = `${filePath}.tmp`

      try {
        const content = JSON.stringify(result.updated, null, 2)
        await fs.writeFile(tempPath, content, 'utf-8')

        // Atomic rename
        await fs.rename(tempPath, filePath)
      } catch (error) {
        // Clean up temp file on error
        try {
          await fs.rm(tempPath, { force: true })
        } catch {
          // Ignore cleanup errors
        }
        throw error
      }

      return result.result
    },
    { timeout: ATOMIC_LOCK_TIMEOUT }
  )
}

/**
 * Atomically read-modify-write a JSON file with a callback.
 * Similar to atomicUpdate but with different callback signature.
 */
export async function atomicReadModifyWrite<T>(
  filePath: string,
  modifyFn: (current: T) => Promise<T> | T
): Promise<T> {
  return atomicUpdate<T, T>(filePath, async (current) => {
    const updated = await Promise.resolve(modifyFn(current))
    return { updated, result: updated }
  })
}

/**
 * Atomically perform multiple operations on a file.
 * Useful when you need to read multiple times or perform complex operations.
 */
export async function atomicTransaction<T, R>(
  filePath: string,
  fn: (read: () => Promise<T>, write: (data: T) => Promise<void>) => Promise<R>
): Promise<R> {
  // Ensure directory exists
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  return withLock(
    filePath,
    async () => {
      let cachedData: T | undefined

      const read = async (): Promise<T> => {
        if (cachedData !== undefined) {
          return cachedData
        }

        try {
          const content = await fs.readFile(filePath, 'utf-8')
          cachedData = JSON.parse(content) as T
          return cachedData
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            if (filePath.includes('alerts') || filePath.includes('tasks') || filePath.includes('logs')) {
              cachedData = [] as T
            } else {
              cachedData = {} as T
            }
            return cachedData
          }
          throw error
        }
      }

      const write = async (data: T): Promise<void> => {
        cachedData = data

        const tempPath = `${filePath}.tmp`

        try {
          const content = JSON.stringify(data, null, 2)
          await fs.writeFile(tempPath, content, 'utf-8')
          await fs.rename(tempPath, filePath)
        } catch (error) {
          try {
            await fs.rm(tempPath, { force: true })
          } catch {
            // Ignore cleanup errors
          }
          throw error
        }
      }

      return fn(read, write)
    },
    { timeout: ATOMIC_LOCK_TIMEOUT }
  )
}
