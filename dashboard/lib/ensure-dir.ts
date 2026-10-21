import { promises as fs } from 'fs'

/**
 * Ensure directory exists, creating parent directories if needed.
 * Safely handles race conditions when multiple processes create the same directory.
 *
 * @param dirPath - Directory path to ensure exists
 * @throws Error if directory cannot be created (excluding EEXIST)
 */
export async function ensureDataDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true })
  } catch (error) {
    // EEXIST is fine - directory already exists
    // Only throw if it's a different error
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code !== 'EEXIST'
    ) {
      throw error
    }
  }
}
