import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import path from 'path'
import { withFileLock } from './file-lock'
import { createLogger } from './logger'

const logger = createLogger('atomic-file-ops')

// Windows: antivirus/indexers can briefly hold the target open, making rename fail transiently
const RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RENAME_MAX_ATTEMPTS = 3
const RENAME_RETRY_DELAY_MS = 20

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.rename(from, to)
      return
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (attempt >= RENAME_MAX_ATTEMPTS || !code || !RENAME_RETRY_CODES.has(code)) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_DELAY_MS * attempt))
    }
  }
}

/**
 * Log file corruption detection using structured logger.
 * FIXED: Now uses the centralized logger instead of direct stderr writes,
 * preserving structured logging, correlation IDs, and consistent error handling.
 */
const logFileCorruption = (filePath: string, error: unknown) => {
  logger.warn('File corruption detected - invalid JSON content', {
    filePath,
    error: error instanceof Error ? error.message : String(error),
    errorType: error instanceof Error ? error.constructor.name : typeof error,
  })
}

/**
 * Read and parse JSON. Caller must already hold the file lock for filePath.
 * With a fallback, a missing file or invalid JSON returns the fallback; without one, both throw.
 */
async function readJsonFile<T>(filePath: string, fallback?: T): Promise<T> {
  let content: string
  try {
    content = await fs.readFile(filePath, 'utf-8')
  } catch (error: unknown) {
    const fsError = error as NodeJS.ErrnoException
    if (fsError?.code === 'ENOENT' && fallback !== undefined) return fallback
    throw error
  }

  try {
    return JSON.parse(content) as T
  } catch (parseError) {
    logFileCorruption(filePath, parseError)
    if (fallback !== undefined) {
      return fallback
    }
    throw parseError
  }
}

/**
 * Serialize and write JSON crash-safely: write a sibling temp file, then rename it over the target.
 * rename() within one directory is atomic, so readers see either the old or the new file, never a partial one.
 * Caller must already hold the file lock for filePath.
 */
async function writeJsonFile<T>(filePath: string, data: T, serializeErrorPrefix: string): Promise<void> {
  const dir = path.dirname(filePath)
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch (error: unknown) {
    const fsError = error as NodeJS.ErrnoException
    // EEXIST is expected and safe; other errors should be thrown
    if (fsError?.code !== 'EEXIST') {
      throw error
    }
  }

  // Validate data can be serialized before writing
  let jsonContent: string
  try {
    jsonContent = JSON.stringify(data, null, 2)
  } catch (error) {
    throw new Error(`${serializeErrorPrefix}: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    await fs.writeFile(tempPath, jsonContent, 'utf-8')
    await renameWithRetry(tempPath, filePath)
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch((cleanupError: unknown) => {
      logger.warn('Failed to remove temp file after write failure', {
        tempPath,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      })
    })
    throw error
  }
}

export async function atomicRead<T>(filePath: string, fallback?: T): Promise<T> {
  return withFileLock(filePath, () => readJsonFile<T>(filePath, fallback))
}

export async function atomicWrite<T>(filePath: string, data: T): Promise<void> {
  return withFileLock(filePath, () => writeJsonFile(filePath, data, 'Failed to serialize data to JSON'))
}

export async function atomicUpdate<T>(
  filePath: string,
  transform: (current: T) => Promise<T> | T,
  fallback: T,
): Promise<T> {
  return withFileLock(filePath, async () => {
    const current = await readJsonFile<T>(filePath, fallback)
    const updated = await transform(current)
    await writeJsonFile(filePath, updated, 'Failed to serialize updated data to JSON')
    return updated
  })
}

export async function atomicConditionalUpdate<T>(
  filePath: string,
  condition: (current: T) => boolean,
  transform: (current: T) => Promise<T> | T,
  fallback: T,
): Promise<{ updated: boolean; data: T }> {
  return withFileLock(filePath, async () => {
    const current = await readJsonFile<T>(filePath, fallback)

    if (!condition(current)) {
      return { updated: false, data: current }
    }

    const updated = await transform(current)
    await writeJsonFile(filePath, updated, 'Failed to serialize updated data to JSON')
    return { updated: true, data: updated }
  })
}

/**
 * Atomic read-modify-write operation
 * Reads file, applies transformation, and writes result atomically
 * Useful for operations that need to read current state, modify it, and write atomically
 */
export async function atomicReadModifyWrite<T>(
  filePath: string,
  modifier: (current: T) => Promise<T> | T,
  fallback: T,
): Promise<T> {
  return withFileLock(filePath, async () => {
    const current = await readJsonFile<T>(filePath, fallback)
    const modified = await modifier(current)
    await writeJsonFile(filePath, modified, 'Failed to serialize data to JSON')
    return modified
  })
}

/**
 * Atomic transaction: run several reads/writes of one file under a single lock.
 * Each write is crash-safe on its own; earlier writes are not rolled back if the callback later throws.
 */
export async function atomicTransaction<T>(
  filePath: string,
  callback: (read: () => Promise<T>, write: (data: T) => Promise<void>) => Promise<T>,
): Promise<T> {
  return withFileLock(filePath, async () => {
    let cachedData: T | undefined

    // The lock is not re-entrant, so read/write must not go through atomicRead/atomicWrite
    const read = async (): Promise<T> => {
      if (cachedData !== undefined) {
        return cachedData
      }
      cachedData = await readJsonFile<T>(filePath)
      return cachedData
    }

    const write = async (data: T): Promise<void> => {
      cachedData = data
      await writeJsonFile(filePath, data, 'Failed to serialize data to JSON')
    }

    return callback(read, write)
  })
}
