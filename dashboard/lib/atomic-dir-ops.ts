/**
 * Atomic directory operations
 * Prevents race conditions in directory creation and enumeration
 *
 * PROBLEM SOLVED:
 * Race condition: fs.stat() → stat fails → mkdir() → readdir()
 * Two concurrent requests both see ENOENT and try to mkdir simultaneously
 * Result: EEXIST error or directory creation race
 *
 * SOLUTION:
 * Use file-level locking on the directory path itself
 * Ensures mkdir and readdir are atomic - no other request can interfere
 */

import { promises as fs } from 'fs'
import { withLock } from './file-lock'

// Backwards compatibility: withFileLock is an alias for withLock
const withFileLock = withLock

/**
 * Atomically ensure directory exists and return contents
 *
 * ATOMIC GUARANTEE: Between start and end of this operation,
 * no other request can create or delete the directory.
 * This prevents the race condition where:
 * - Request A: mkdir succeeds
 * - Request B: readdir gets ENOENT (race with delete)
 *
 * @param dirPath - Directory path
 * @returns Array of filenames in directory
 */
export async function atomicReaddir(dirPath: string): Promise<string[]> {
  return withLock(dirPath, async (_lock) => {
    try {
      // Ensure directory exists (idempotent)
      await fs.mkdir(dirPath, { recursive: true })
      // Read contents while lock is held (no race with delete/create)
      return await fs.readdir(dirPath)
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') {
        // Shouldn't happen after mkdir, but handle gracefully
        return []
      }
      throw error
    }
  })
}

/**
 * Atomically ensure directory exists
 * Safe for concurrent calls - only one succeeds, others wait for completion
 *
 * ATOMIC GUARANTEE: Directory creation is synchronized
 * Multiple concurrent calls will serialize, no race condition
 *
 * @param dirPath - Directory path
 */
export async function atomicMkdir(dirPath: string): Promise<void> {
  return withLock(dirPath, async (_lock) => {
    try {
      await fs.mkdir(dirPath, { recursive: true })
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      // EEXIST is fine - another request created it while we waited
      if (err.code !== 'EEXIST') {
        throw error
      }
    }
  })
}

/**
 * Atomically enumerate and process directory contents
 * The entire enumeration → processing cycle is atomic
 *
 * ATOMIC GUARANTEE:
 * - Directory won't be deleted/recreated during enumeration
 * - File list won't change during processing
 * - All files in the snapshot are guaranteed to exist when processor is called
 *   (unless processor deletes them, which is outside this guarantee)
 *
 * @param dirPath - Directory path
 * @param processor - Function to process each file
 * @returns Results from processor for each file
 */
export async function atomicProcessDirectory<T>(
  dirPath: string,
  processor: (filename: string) => Promise<T>
): Promise<T[]> {
  return withLock(dirPath, async (_lock) => {
    // Ensure directory exists
    try {
      await fs.mkdir(dirPath, { recursive: true })
    } catch {
      // Already exists, which is fine
    }

    // Get file list atomically (no races with delete/add during enumeration)
    let files: string[] = []
    try {
      files = await fs.readdir(dirPath)
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') {
        // Directory was somehow deleted after mkdir - return empty
        return []
      }
      throw error
    }

    // Process each file (still protected by lock)
    // Note: Individual file I/O should use their own locks if needed
    const results = await Promise.all(
      files.map((filename) => processor(filename))
    )

    return results
  })
}

/**
 * Atomically get file count in directory
 * Useful for monitoring/metrics
 *
 * @param dirPath - Directory path
 * @returns Number of files in directory
 */
export async function atomicFileCount(dirPath: string): Promise<number> {
  return withLock(dirPath, async (_lock) => {
    try {
      await fs.mkdir(dirPath, { recursive: true })
      const files = await fs.readdir(dirPath)
      return files.length
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') {
        return 0
      }
      throw error
    }
  })
}
