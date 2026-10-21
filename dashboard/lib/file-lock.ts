/**
 * Simple file locking mechanism for concurrent file access
 * Prevents data corruption from simultaneous read/write operations
 */

type Lock = {
  promise: Promise<void>
  resolve: () => void
}

const locks = new Map<string, Lock>()

/**
 * Acquire a lock for a file path
 * Waits if lock is already held, then executes callback exclusively
 *
 * @param filePath - Path to lock
 * @param callback - Function to execute with exclusive access
 * @returns Result of callback
 */
export async function withFileLock<T>(
  filePath: string,
  callback: () => Promise<T>
): Promise<T> {
  // Wait for any existing lock
  if (locks.has(filePath)) {
    await locks.get(filePath)!.promise
  }

  // Create new lock
  let resolveNewLock: () => void = () => {}
  const newLock = new Promise<void>(resolve => {
    resolveNewLock = resolve
  })

  const lockEntry: Lock = {
    promise: newLock,
    resolve: resolveNewLock,
  }

  locks.set(filePath, lockEntry)

  try {
    // Execute callback with exclusive access
    const result = await callback()
    return result
  } finally {
    // Release lock
    lockEntry.resolve()
    locks.delete(filePath)
  }
}

/**
 * Clear all locks (for testing only)
 */
export function clearAllLocks(): void {
  locks.clear()
}

/**
 * Get lock count (for monitoring)
 */
export function getLockCount(): number {
  return locks.size
}
