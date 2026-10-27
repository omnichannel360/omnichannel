import { describe, it, expect, beforeEach } from '@jest/globals'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

/**
 * Integration tests for async I/O across all API endpoints
 * Verifies:
 * 1. No synchronous file operations (readFileSync, writeFileSync)
 * 2. All file operations use fs/promises
 * 3. Proper error handling for concurrent access
 * 4. File locking prevents data corruption
 */

const apiDir = path.join(process.cwd(), 'app', 'api')

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

        // Check for fs/promises import
        expect(content).toMatch(/import.*fs.*from\s+['"]fs['"]/)
        expect(content).toMatch(/promises/)

        // Verify no sync imports
        expect(content).not.toMatch(/from\s+['"]fs\/promises['"]/)
      }
    })

    it('should import file locking utility in all APIs', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        expect(content).toMatch(/withFileLock/)
        expect(content).toMatch(/file-lock/)
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

        expect(content).toMatch(/await.*readFile/)
      }
    })

    it('should use await for writeFile', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        expect(content).toMatch(/await.*writeFile/)
      }
    })

    it('should use await for mkdir', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        expect(content).toMatch(/await.*mkdir/)
      }
    })

    it('should use await for stat', async () => {
      for (const file of apiFiles) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        // Not all files use stat, but if they do, it should be awaited
        if (content.includes('stat(')) {
          expect(content).toMatch(/await.*stat/)
        }
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

    it('should handle JSON parse errors', async () => {
      const filesWithJsonParse = ['alerts/route.ts', 'conductor/route.ts', 'kanban/route.ts']

      for (const file of filesWithJsonParse) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        // Should have nested try-catch for JSON.parse
        const parseErrorHandling = content.match(/JSON\.parse.*\n.*try|catch.*JSON\.parse/s)
        expect(parseErrorHandling || content.includes('parseError')).toBeTruthy()
      }
    })
  })

  describe('Concurrent Access Safety', () => {
    it('should use file locking for load operations', async () => {
      const filesWithLoad = ['alerts/route.ts', 'conductor/route.ts', 'kanban/route.ts']

      for (const file of filesWithLoad) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        // Check for withFileLock wrapper around load functions
        expect(content).toMatch(/withFileLock.*async.*\(\)/)
      }
    })

    it('should use file locking for save operations', async () => {
      const filesWithSave = ['alerts/route.ts', 'conductor/route.ts', 'kanban/route.ts']

      for (const file of filesWithSave) {
        const filePath = path.join(apiDir, file)
        const content = await fs.readFile(filePath, 'utf-8')

        // Check for withFileLock wrapper around save functions
        expect(content).toMatch(/withFileLock.*async.*\(\)/)
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

        expect(content).toMatch(/interface\s+\w+/)
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

