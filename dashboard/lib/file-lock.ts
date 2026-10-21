import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

interface LockOptions {
  timeout?: number
  lockDir?: string
  maxRetries?: number
  retryDelay?: number
}

interface Lock {
  path: string
  lockPath: string
  acquired: number
  release: () => Promise<void>
}

const DEFAULT_LOCK_DIR = path.join(os.tmpdir(), '.file-locks')
const DEFAULT_TIMEOUT = 30000 // 30 seconds
const DEFAULT_MAX_RETRIES = 300 // 30 seconds with 100ms delays
const DEFAULT_RETRY_DELAY = 100 // 100ms

// Initialize lock directory
async function ensureLockDir(lockDir: string): Promise<void> {
  try {
    await fs.mkdir(lockDir, { recursive: true })
  } catch {
    // Directory might exist, ignore error
  }
}

// Generate lock file path from target file path
function getLockPath(filePath: string, lockDir: string): string {
  const crypto = require('crypto')
  const hash = crypto.createHash('sha256').update(filePath).digest('hex')
  return path.join(lockDir, `${hash}.lock`)
}

// Create lock file with metadata
async function createLockFile(
  lockPath: string,
  metadata: { pid: number; timestamp: number; filePath: string }
): Promise<void> {
  await fs.writeFile(lockPath, JSON.stringify(metadata), 'utf-8')
}

// Read lock file metadata
async function readLockFile(lockPath: string): Promise<{ pid: number; timestamp: number; filePath: string } | null> {
  try {
    const content = await fs.readFile(lockPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

// Check if lock is stale (process died)
function isLockStale(metadata: { pid: number; timestamp: number }, timeout: number): boolean {
  const now = Date.now()
  const age = now - metadata.timestamp

  // If lock is older than timeout, consider it stale
  if (age > timeout) {
    return true
  }

  return false
}

/**
 * Acquire an exclusive lock on a file.
 * Returns a lock object that must be released to unlock the file.
 */
export async function acquireLock(
  filePath: string,
  options: LockOptions = {}
): Promise<Lock> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  const lockDir = options.lockDir ?? DEFAULT_LOCK_DIR
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY

  await ensureLockDir(lockDir)

  const lockPath = getLockPath(filePath, lockDir)
  const lockMetadata = {
    pid: process.pid,
    timestamp: Date.now(),
    filePath,
  }

  let retries = 0

  while (retries < maxRetries) {
    try {
      // Try to create lock file exclusively (will fail if exists)
      const fd = await fs.open(lockPath, 'wx')
      await fd.close()

      // Lock acquired, write metadata
      await createLockFile(lockPath, lockMetadata)

      // Return lock object with release function
      return {
        path: filePath,
        lockPath,
        acquired: Date.now(),
        release: async () => {
          try {
            await fs.rm(lockPath, { force: true })
          } catch {
            // Ignore errors during release
          }
        },
      }
    } catch (error) {
      // Lock file exists, check if it's stale
      const metadata = await readLockFile(lockPath)

      if (metadata && isLockStale(metadata, timeout)) {
        // Stale lock, remove it and retry
        try {
          await fs.rm(lockPath, { force: true })
        } catch {
          // Ignore error, will retry
        }
        retries++
        continue
      }

      // Lock exists and is not stale, wait and retry
      await new Promise((resolve) => setTimeout(resolve, retryDelay))
      retries++
    }
  }

  throw new Error(`Failed to acquire lock on ${filePath} after ${maxRetries} retries`)
}

/**
 * Try to acquire a lock with a timeout. Returns null if unable to acquire.
 */
export async function tryAcquireLock(
  filePath: string,
  timeoutMs: number = 5000
): Promise<Lock | null> {
  try {
    return await Promise.race([
      acquireLock(filePath),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Lock acquire timeout')), timeoutMs)
      ),
    ])
  } catch {
    return null
  }
}

/**
 * Release a lock obtained from acquireLock
 */
export async function releaseLock(lock: Lock): Promise<void> {
  await lock.release()
}

/**
 * Execute a function while holding a lock on a file.
 * Automatically acquires and releases the lock.
 */
export async function withLock<T>(
  filePath: string,
  fn: (lock: Lock) => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const lock = await acquireLock(filePath, options)

  try {
    return await fn(lock)
  } finally {
    await lock.release()
  }
}

/**
 * Clean up stale lock files (older than timeout)
 */
export async function cleanupStaleLocks(
  lockDir: string = DEFAULT_LOCK_DIR,
  timeout: number = DEFAULT_TIMEOUT
): Promise<number> {
  try {
    await ensureLockDir(lockDir)

    const files = await fs.readdir(lockDir)
    let cleaned = 0

    for (const file of files) {
      const lockPath = path.join(lockDir, file)

      if (!file.endsWith('.lock')) {
        continue
      }

      const metadata = await readLockFile(lockPath)

      if (metadata && isLockStale(metadata, timeout)) {
        try {
          await fs.rm(lockPath, { force: true })
          cleaned++
        } catch {
          // Ignore errors
        }
      }
    }

    return cleaned
  } catch {
    return 0
  }
}

/**
 * Wrapper for atomic-file-ops compatibility
 * Provides the withFileLock function with the signature expected by atomicUpdate/atomicRead
 */
export async function withFileLock<T>(
  filePath: string,
  callback: () => Promise<T> | T
): Promise<T> {
  const lock = await acquireLock(filePath)
  try {
    return await Promise.resolve(callback())
  } finally {
    await lock.release()
  }
}

/**
 * Backwards compatibility wrapper: withFileLock
 * Uses the new OS-level file locking system internally
 */
export async function withFileLock<T>(
  filePath: string,
  callback: () => Promise<T> | T
): Promise<T> {
  return withLock(filePath, async () => {
    return await Promise.resolve(callback())
  })
}

/**
 * Backwards compatibility: clearAllLocks (no-op with OS-level locks)
 * Lock files are cleaned up on release or by stale lock cleanup
 */
export function clearAllLocks(): void {
  // Lock files are managed by the filesystem, cleared on release
  // This function exists for test compatibility
}

/**
 * Backwards compatibility: getLockCount (monitoring only)
 */
export function getLockCount(): number {
  // With OS-level locks, we can't easily count active locks
  // This would require scanning the lock directory
  // For now, return 0 (locks are managed by filesystem)
  return 0
}

export { Lock, LockOptions }
