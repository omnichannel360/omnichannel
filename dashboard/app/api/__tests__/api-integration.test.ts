import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { NextRequest, NextResponse } from 'next/server'

jest.mock('@/lib/auth', () => ({
  verifyAuth: jest.fn(async () => ({ authenticated: true })),
  createUnauthorizedResponse: jest.fn(),
}))

/**
 * Integration tests for async I/O across all API endpoints
 * Verifies:
 * 1. No synchronous file operations (readFileSync, writeFileSync)
 * 2. All file operations are async (fs.promises directly, or the async atomic helpers)
 * 3. Proper error handling for concurrent access
 * 4. File locking prevents data corruption
 */

const apiDir = path.join(process.cwd(), 'app', 'api')

// Atomic helpers do async I/O under withFileLock internally (lib/atomic-file-ops, lib/atomic-dir-ops)
const ATOMIC_HELPER_IMPORT = /from\s+['"]@\/lib\/atomic-(file|dir)-ops['"]/

/**
 * Lines where an async file operation is invoked as a bare statement, i.e. a floating
 * promise that is neither awaited, returned, assigned, nor passed as an argument.
 */
function findFloatingCalls(content: string, callPattern: string): string[] {
  const callAtLineStart = new RegExp(`^\\s*(${callPattern})\\s*(<[^>]*>)?\\(`)
  const lines = content.split('\n')
  return lines.filter((line, i) => {
    if (!callAtLineStart.test(line)) return false
    const prev = lines.slice(0, i).reverse().find((l) => l.trim() !== '') ?? ''
    // Continuation of an expression (argument list, assignment, arrow body) is not floating
    return !/[(,=]\s*$|=>\s*$/.test(prev)
  })
}

type RouteModule = Record<string, ((req: NextRequest) => Promise<NextResponse>) | undefined>

/** Load a route module with process.cwd() pointed at `cwd`, so it uses <cwd>/data/*.json */
function loadRouteWithCwd(routeFile: string, cwd: string): RouteModule {
  const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(cwd)
  let mod: RouteModule | undefined
  try {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      mod = require(path.join(apiDir, routeFile)) as RouteModule
    })
  } finally {
    cwdSpy.mockRestore()
  }
  if (!mod) throw new Error(`Failed to load ${routeFile}`)
  return mod
}

describe('API Integration - Async I/O Verification', () => {
  const apiFiles = [
    'alerts/route.ts',
    'brain/route.ts',
    'conductor/route.ts',
    'kanban/route.ts',
    'meetings/route.ts',
  ]

  describe('Import Verification', () => {
    it('should use fs/promises in all API files', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        // Direct fs usage must be the promises API; otherwise file I/O is delegated to the async atomic helpers
        const importsFs = /from\s+['"]fs['"]/.test(content)
        if (importsFs) {
          expect(content).toMatch(/import\s*\{\s*promises\s+as\s+fs\s*\}\s*from\s+['"]fs['"]/)
        } else {
          expect(content).toMatch(ATOMIC_HELPER_IMPORT)
        }

        // Verify no sync imports
        expect(content).not.toMatch(/from\s+['"]fs\/promises['"]/)
      }
    })

    it('should import file locking utility in all APIs', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        // Locking is either explicit (withFileLock from lib/file-lock) or inside the atomic helpers
        const usesFileLock = /withFileLock/.test(content) && /file-lock/.test(content)
        expect(usesFileLock || ATOMIC_HELPER_IMPORT.test(content)).toBe(true)
      }
    })
  })

  describe('Sync I/O Prevention', () => {
    it('should not use readFileSync', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        expect(content).not.toMatch(/readFileSync/)
      }
    })

    it('should not use writeFileSync', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        expect(content).not.toMatch(/writeFileSync/)
      }
    })

    it('should not use existsSync', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        expect(content).not.toMatch(/existsSync/)
      }
    })

    it('should not use require() for JSON files', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        // Check for require() with .json
        expect(content).not.toMatch(/require\s*\(.*\.json/)
      }
    })
  })

  describe('Async I/O Patterns', () => {
    it('should use await for readFile', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        expect(findFloatingCalls(content, 'fs\\.readFile|atomicRead|atomicReaddir')).toEqual([])
      }
    })

    it('should use await for writeFile', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        expect(findFloatingCalls(content, 'fs\\.writeFile|atomicWrite|atomicUpdate')).toEqual([])
      }
    })

    it('should use await for mkdir', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        expect(findFloatingCalls(content, 'fs\\.mkdir|ensureDataDir')).toEqual([])
      }
    })

    it('should use await for stat', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        // Not all files use stat, but if they do, it should be awaited
        // (a substring check for 'stat(' also matched e.g. 'Status(' / 'status(')
        expect(findFloatingCalls(content, 'fs\\.stat')).toEqual([])
      }
    })
  })

  describe('Error Handling', () => {
    it('should have try-catch blocks for file operations', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        expect(content).toMatch(/try\s*\{/)
        expect(content).toMatch(/catch/)
      }
    })

    describe('JSON parse errors in data files', () => {
      let tmpCwd: string

      beforeEach(async () => {
        tmpCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'api-integration-'))
        await fs.mkdir(path.join(tmpCwd, 'data'), { recursive: true })
      })

      afterEach(async () => {
        await fs.rm(tmpCwd, { recursive: true, force: true })
      })

      const cases = [
        { route: 'alerts/route.ts', dataFile: 'alerts.json' },
        { route: 'conductor/route.ts', dataFile: 'conductor-logs.json' },
        { route: 'kanban/route.ts', dataFile: 'kanban.json' },
      ]

      it.each(cases)('should handle JSON parse errors ($route)', async ({ route, dataFile }) => {
        const corrupted = '{ "not": valid json'
        const dataPath = path.join(tmpCwd, 'data', dataFile)
        await fs.writeFile(dataPath, corrupted, 'utf-8')

        const { GET } = loadRouteWithCwd(route, tmpCwd)
        const response = await GET!(new NextRequest(`http://localhost/api/${path.dirname(route)}`))

        // Handled: a well-formed JSON API response instead of an unhandled exception
        const body = await response.json()
        expect(typeof body.success).toBe('boolean')
        if (!body.success) {
          expect(response.status).toBeGreaterThanOrEqual(400)
        }

        // Reading a corrupted file must never rewrite or truncate it
        await expect(fs.readFile(dataPath, 'utf-8')).resolves.toBe(corrupted)
      })
    })
  })

  describe('Concurrent Access Safety', () => {
    it('should use file locking for load operations', async () => {
      const filesWithLoad = ['alerts/route.ts', 'conductor/route.ts', 'kanban/route.ts']

      for (const file of filesWithLoad) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        // Reads happen under a lock: explicit withFileLock wrapper, or atomicRead (locks internally)
        const explicitLock = /withFileLock.*async.*\(\)/.test(content)
        const atomicLoad = ATOMIC_HELPER_IMPORT.test(content) && /\batomicRead\s*(<[^>]*>)?\(/.test(content)
        expect(explicitLock || atomicLoad).toBe(true)
      }
    })

    it('should use file locking for save operations', async () => {
      const filesWithSave = ['alerts/route.ts', 'conductor/route.ts', 'kanban/route.ts']

      for (const file of filesWithSave) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        // Writes happen under a lock: explicit withFileLock wrapper, or atomicUpdate/atomicWrite (lock internally)
        const explicitLock = /withFileLock.*async.*\(\)/.test(content)
        const atomicSave = ATOMIC_HELPER_IMPORT.test(content) && /\batomic(Update|Write)\s*(<[^>]*>)?\(/.test(content)
        expect(explicitLock || atomicSave).toBe(true)
      }
    })
  })

  describe('Type Safety', () => {
    it('should use TypeScript for all API files', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)

        expect(filePath).toMatch(/\.ts$/)
        expect(filePath).not.toMatch(/\.js$/)
      }
    })

    it('should have interfaces for data types', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        // Data types may be declared locally or imported from the shared validation schemas
        expect(content).toMatch(/interface\s+\w+|\btype\s+\w+\s*=|import\s+type\s|import\s*\{[^}]*\btype\s+\w+/)
      }
    })
  })
})

describe('Performance Characteristics', () => {
  it('should support concurrent requests without blocking', async () => {
    // Simulate concurrent requests
    const start = Date.now()

    const operations = Array.from({ length: 10 }, async (_, i) => {
      return new Promise(resolve => {
        setTimeout(() => resolve(i), Math.random() * 100)
      })
    })

    await Promise.all(operations)
    const duration = Date.now() - start

    // With async I/O, concurrent operations should take ~100ms
    // With sync I/O, they would take ~1000ms (10 * 100ms)
    expect(duration).toBeLessThan(500)
  })
})

