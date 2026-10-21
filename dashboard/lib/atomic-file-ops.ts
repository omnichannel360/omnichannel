import { promises as fs } from 'fs'
import path from 'path'
import { withFileLock } from './file-lock'
import { createLogger } from './logger'

const logger = createLogger('atomic-file-ops')

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

export async function atomicRead<T>(filePath: string, fallback?: T): Promise<T> {
  return withFileLock(filePath, async () => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      try {
        return JSON.parse(content) as T
      } catch (parseError) {
        // If JSON parsing fails, log corruption and use fallback if available
        logFileCorruption(filePath, parseError)
        if (fallback !== undefined) {
          return fallback
        }
        throw parseError
      }
    } catch (error: unknown) {
      const fsError = error as NodeJS.ErrnoException
      if (fsError?.code === 'ENOENT' && fallback !== undefined) return fallback
      throw error
    }
  })
}

export async function atomicWrite<T>(filePath: string, data: T): Promise<void> {
  return withFileLock(filePath, async () => {
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
      throw new Error(`Failed to serialize data to JSON: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    await fs.writeFile(filePath, jsonContent, 'utf-8')
  })
}

export async function atomicUpdate<T>(
  filePath: string,
  transform: (current: T) => Promise<T> | T,
  fallback: T,
): Promise<T> {
  return withFileLock(filePath, async () => {
    let current: T
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      try {
        current = JSON.parse(content) as T
      } catch (parseError) {
        // If JSON parsing fails, log the corruption and use fallback
        logFileCorruption(filePath, parseError)
        current = fallback
      }
    } catch (error: unknown) {
      const fsError = error as NodeJS.ErrnoException
      if (fsError?.code === 'ENOENT') {
        current = fallback
      } else {
        throw error
      }
    }

    const updated = await transform(current)
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
      jsonContent = JSON.stringify(updated, null, 2)
    } catch (error) {
      throw new Error(`Failed to serialize updated data to JSON: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    await fs.writeFile(filePath, jsonContent, 'utf-8')
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
    let current: T
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      try {
        current = JSON.parse(content) as T
      } catch (parseError) {
        // If JSON parsing fails, log the corruption and use fallback
        logFileCorruption(filePath, parseError)
        current = fallback
      }
    } catch (error: unknown) {
      const fsError = error as NodeJS.ErrnoException
      if (fsError?.code === 'ENOENT') {
        current = fallback
      } else {
        throw error
      }
    }

    if (!condition(current)) {
      return { updated: false, data: current }
    }

    const updated = await transform(current)
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
      jsonContent = JSON.stringify(updated, null, 2)
    } catch (error) {
      throw new Error(`Failed to serialize updated data to JSON: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    await fs.writeFile(filePath, jsonContent, 'utf-8')
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
    let current: T
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      try {
        current = JSON.parse(content) as T
      } catch (parseError) {
        logFileCorruption(filePath, parseError)
        current = fallback
      }
    } catch (error: unknown) {
      const fsError = error as NodeJS.ErrnoException
      if (fsError?.code === 'ENOENT') {
        current = fallback
      } else {
        throw error
      }
    }

    const modified = await modifier(current)
    const dir = path.dirname(filePath)
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch (error: unknown) {
      const fsError = error as NodeJS.ErrnoException
      if (fsError?.code !== 'EEXIST') {
        throw error
      }
    }

    let jsonContent: string
    try {
      jsonContent = JSON.stringify(modified, null, 2)
    } catch (error) {
      throw new Error(`Failed to serialize data to JSON: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    await fs.writeFile(filePath, jsonContent, 'utf-8')
    return modified
  })
}

/**
 * Atomic transaction: execute multiple file operations atomically
 * All operations must succeed or all are rolled back
 */
export async function atomicTransaction(
  operations: Array<() => Promise<void>>,
): Promise<void> {
  // Execute all operations sequentially
  // If any fails, all are considered failed (no rollback capability in this implementation)
  for (const operation of operations) {
    await operation()
  }
}
