import { promises as fs } from 'fs'
import { createHash, randomUUID } from 'crypto'
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
 * Thrown by read-modify-write helpers when the target file exists but is not valid JSON.
 * The write is refused so existing records are never replaced by the fallback.
 * The message deliberately avoids words the route error mappers treat as 4xx ("invalid", "not found").
 */
export class CorruptDataFileError extends Error {
  readonly filePath: string
  readonly backupPath: string | null
  readonly cause: unknown

  constructor(filePath: string, backupPath: string | null, cause: unknown) {
    super('Stored data could not be read; the write was refused to protect existing records')
    this.name = 'CorruptDataFileError'
    this.filePath = filePath
    this.backupPath = backupPath
    this.cause = cause
  }
}

/**
 * Log file corruption detection using structured logger.
 * FIXED: Now uses the centralized logger instead of direct stderr writes,
 * preserving structured logging, correlation IDs, and consistent error handling.
 */
const logFileCorruption = (filePath: string, error: unknown, extra: Record<string, unknown> = {}) => {
  logger.error('File corruption detected - invalid JSON content', {
    filePath,
    error: error instanceof Error ? error.message : String(error),
    errorType: error instanceof Error ? error.constructor.name : typeof error,
    ...extra,
  })
}

/**
 * Preserve the corrupted bytes next to the target before refusing the write.
 * Named by content hash, so repeated failures on the same corruption create one copy.
 * Best effort: a failed backup is logged and never masks the corruption error.
 */
async function backupCorruptFile(filePath: string, content: string): Promise<string | null> {
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16)
  const backupPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.corrupt-${hash}.json`)
  try {
    // Owner-only: data files can hold user messages
    await fs.writeFile(backupPath, content, { encoding: 'utf-8', flag: 'wx', mode: 0o600 })
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') {
      logger.warn('Failed to back up corrupted data file', {
        filePath,
        backupPath,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }
  return backupPath
}

type CorruptionPolicy = 'fallback' | 'refuse'

/**
 * Read and parse JSON. Caller must already hold the file lock for filePath.
 * A missing file returns the fallback when one is given, otherwise throws.
 * Invalid JSON: 'fallback' (reads) returns the fallback when given, otherwise throws the parse error;
 * 'refuse' (read-modify-write) backs up the bytes and throws CorruptDataFileError, never using the fallback.
 */
async function readJsonFile<T>(filePath: string, fallback?: T, onCorrupt: CorruptionPolicy = 'fallback'): Promise<T> {
  let content: string
  try {
    content = await fs.readFile(filePath, 'utf-8')
  } catch (error: unknown) {
    const fsError = error as NodeJS.ErrnoException
    if (fsError?.code === 'ENOENT' && fallback !== undefined) return fallback
    throw error
  }

  try {
    const parsed: unknown = JSON.parse(content)
    // Valid JSON of the wrong shape (e.g. {} where a list is stored) is as unsafe to write over as a torn file
    if (onCorrupt === 'refuse' && Array.isArray(fallback) && !Array.isArray(parsed)) {
      throw new TypeError(`Expected a JSON array, found ${parsed === null ? 'null' : typeof parsed}`)
    }
    return parsed as T
  } catch (parseError) {
    if (onCorrupt === 'refuse') {
      const backupPath = await backupCorruptFile(filePath, content)
      logFileCorruption(filePath, parseError, { action: 'write_refused', backupPath })
      throw new CorruptDataFileError(filePath, backupPath, parseError)
    }
    logFileCorruption(filePath, parseError, { action: 'read_fallback' })
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
    const current = await readJsonFile<T>(filePath, fallback, 'refuse')
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
    const current = await readJsonFile<T>(filePath, fallback, 'refuse')

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
    const current = await readJsonFile<T>(filePath, fallback, 'refuse')
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
      cachedData = await readJsonFile<T>(filePath, undefined, 'refuse')
      return cachedData
    }

    const write = async (data: T): Promise<void> => {
      cachedData = data
      await writeJsonFile(filePath, data, 'Failed to serialize data to JSON')
    }

    return callback(read, write)
  })
}
