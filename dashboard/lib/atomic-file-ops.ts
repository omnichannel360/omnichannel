import { promises as fs } from 'fs'
import { withFileLock } from './file-lock'

export async function atomicRead<T>(filePath: string, fallback?: T): Promise<T> {
  return withFileLock(filePath, async () => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content) as T
    } catch (error: unknown) {
      const fsError = error as NodeJS.ErrnoException
      if (fsError?.code === 'ENOENT' && fallback !== undefined) return fallback
      throw error
    }
  })
}

export async function atomicWrite<T>(filePath: string, data: T): Promise<void> {
  return withFileLock(filePath, async () => {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'))
    await fs.mkdir(dir, { recursive: true }).catch(() => {})
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
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
      current = JSON.parse(content) as T
    } catch (error: unknown) {
      const fsError = error as NodeJS.ErrnoException
      if (fsError?.code === 'ENOENT') {
        current = fallback
      } else {
        throw error
      }
    }

    const updated = await transform(current)
    const dir = filePath.substring(0, filePath.lastIndexOf('/'))
    await fs.mkdir(dir, { recursive: true }).catch(() => {})
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8')
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
      current = JSON.parse(content) as T
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
    const dir = filePath.substring(0, filePath.lastIndexOf('/'))
    await fs.mkdir(dir, { recursive: true }).catch(() => {})
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8')
    return { updated: true, data: updated }
  })
}
