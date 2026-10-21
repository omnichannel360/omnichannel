/**
 * Atomic file operations for safe concurrent data access
 * Ensures read-modify-write cycles are protected as a single atomic unit
 * No time gap between load and save where other requests can interfere
 */

import { promises as fs } from 'fs'
import path from 'path'
import { withFileLock } from './file-lock'

/**
 * Atomically read, modify, and write a JSON file in a single critical section
 * The entire operation (read → modify → write) holds the lock for the file
 *
 * @param filePath - Path to JSON file
 * @param transform - Function that reads current data and returns updated data
 * @returns The value returned by transform function
 */
export async function atomicUpdate<T, R>(
  filePath: string,
  transform: (current: T) => Promise<{ updated: T; result: R }> | { updated: T; result: R }
): Promise<R> {
  return withFileLock(filePath, async () => {
    // Ensure directory exists
    const dir = path.dirname(filePath)
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch {
      // Ignore if already exists
    }

    // Read current data
    let current: T
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      try {
        current = JSON.parse(content)
      } catch (parseError) {
        throw new Error(`File is corrupted or contains invalid JSON: ${filePath}`)
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') {
        // File doesn't exist - use empty array as default
        current = [] as unknown as T
      } else {
        throw error
      }
    }

    // Transform (modify) and get result
    const { updated, result } = await Promise.resolve(transform(current))

    // Write atomically (this is now protected by the lock held for the entire operation)
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8')

    return result
  })
}

/**
 * Atomically read and conditionally update a JSON file
 * Allows inspection and selective updates in a single critical section
 *
 * @param filePath - Path to JSON file
 * @param inspector - Function that inspects current data and decides whether to update
 * @returns Object with the data and whether it was updated
 */
export async function atomicConditionalUpdate<T>(
  filePath: string,
  inspector: (current: T) => Promise<{ updated?: T; shouldUpdate: boolean }> | { updated?: T; shouldUpdate: boolean }
): Promise<{ data: T; updated: boolean }> {
  return withFileLock(filePath, async () => {
    // Ensure directory exists
    const dir = path.dirname(filePath)
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch {
      // Ignore if already exists
    }

    // Read current data
    let current: T
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      try {
        current = JSON.parse(content)
      } catch (parseError) {
        throw new Error(`File is corrupted or contains invalid JSON: ${filePath}`)
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') {
        current = [] as unknown as T
      } else {
        throw error
      }
    }

    // Inspect and determine if update is needed
    const decision = await Promise.resolve(inspector(current))

    if (decision.shouldUpdate && decision.updated !== undefined) {
      // Write atomically
      await fs.writeFile(filePath, JSON.stringify(decision.updated, null, 2), 'utf-8')
      return { data: decision.updated, updated: true }
    }

    return { data: current, updated: false }
  })
}

/**
 * Atomically read a JSON file safely
 * Ensures consistent view of data during read
 *
 * @param filePath - Path to JSON file
 * @returns Parsed JSON data
 */
export async function atomicRead<T>(filePath: string): Promise<T> {
  return withFileLock(filePath, async () => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      try {
        return JSON.parse(content) as T
      } catch (parseError) {
        throw new Error(`File is corrupted or contains invalid JSON: ${filePath}`)
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') {
        return [] as unknown as T
      }
      throw error
    }
  })
}

/**
 * Atomically write a JSON file
 * Ensures consistent write with lock
 *
 * @param filePath - Path to JSON file
 * @param data - Data to write
 */
export async function atomicWrite<T>(filePath: string, data: T): Promise<void> {
  return withFileLock(filePath, async () => {
    const dir = path.dirname(filePath)
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch {
      // Ignore if already exists
    }

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  })
}
