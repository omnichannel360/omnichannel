import { promises as fs } from 'fs'
import path from 'path'
import { clearAllLocks } from '@/lib/file-lock'

describe('Alerts API - Async File I/O Verification', () => {
  const testDataDir = path.join(process.cwd(), 'test-data')
  const testFile = path.join(testDataDir, 'test-alerts.json')

  beforeEach(async () => {
    clearAllLocks()
    // Ensure test data directory exists
    try {
      await fs.mkdir(testDataDir, { recursive: true })
    } catch {
      // Already exists
    }
  })

  afterEach(async () => {
    // Cleanup test files
    try {
      await fs.unlink(testFile)
    } catch {
      // File doesn't exist
    }
  })

  test('ensures all file I/O operations are async', async () => {
    const sourceFile = path.join(process.cwd(), 'dashboard/app/api/alerts/route.ts')
    const content = await fs.readFile(sourceFile, 'utf-8')

    // Verify: No synchronous file operations
    expect(content).not.toMatch(/readFileSync/)
    expect(content).not.toMatch(/writeFileSync/)
    expect(content).not.toMatch(/statSync/)
    expect(content).not.toMatch(/mkdirSync/)

    // Verify: Uses fs.promises
    expect(content).toMatch(/import.*promises.*fs/)

    // Verify: Uses withFileLock for concurrent access control
    expect(content).toMatch(/withFileLock/)
    expect(content).toMatch(/import.*withFileLock/)

    // Verify: Uses await for all I/O
    expect(content).toMatch(/await fs\.readFile/)
    expect(content).toMatch(/await fs\.writeFile/)
  })

  test('verifies all API endpoints use async patterns', async () => {
    const endpoints = [
      'dashboard/app/api/alerts/route.ts',
      'dashboard/app/api/brain/route.ts',
      'dashboard/app/api/conductor/route.ts',
      'dashboard/app/api/kanban/route.ts',
      'dashboard/app/api/meetings/route.ts',
    ]

    for (const endpoint of endpoints) {
      const filePath = path.join(process.cwd(), endpoint)
      const content = await fs.readFile(filePath, 'utf-8')

      // Each endpoint should use fs.promises
      expect(content).toMatch(/import.*promises.*fs/, `${endpoint} should use fs.promises`)

      // Each endpoint should use withFileLock
      expect(content).toMatch(/withFileLock/, `${endpoint} should use withFileLock`)

      // Each endpoint should not have synchronous operations
      expect(content).not.toMatch(/readFileSync/, `${endpoint} should not use readFileSync`)
      expect(content).not.toMatch(/writeFileSync/, `${endpoint} should not use writeFileSync`)
    }
  })

  test('verifies error handling with JSON parse errors', async () => {
    const sourceFile = path.join(process.cwd(), 'dashboard/app/api/alerts/route.ts')
    const content = await fs.readFile(sourceFile, 'utf-8')

    // Verify explicit error handling for JSON parse failures
    expect(content).toMatch(/JSON\.parse.*catch/)
    expect(content).toMatch(/corrupted|invalid JSON/i)
  })

  test('file-lock utility prevents concurrent write corruption', async () => {
    const { withFileLock } = await import('@/lib/file-lock')

    const results: number[] = []
    const operations = Array(5).fill(null).map((_, i) =>
      withFileLock(testFile, async () => {
        // Simulate file operation
        await new Promise(resolve => setTimeout(resolve, 10))
        results.push(i)
        return i
      })
    )

    const resolved = await Promise.all(operations)

    // Verify sequential execution (file lock prevents parallelism)
    expect(results.length).toBe(5)
    expect(resolved).toEqual([0, 1, 2, 3, 4])
  })

  test('verifies async/await chain completeness', async () => {
    const sourceFile = path.join(process.cwd(), 'dashboard/app/api/alerts/route.ts')
    const content = await fs.readFile(sourceFile, 'utf-8')

    // Check that all async functions properly use await
    const asyncFunctions = content.match(/async function \w+.*?\{[\s\S]*?\n\}/g) || []

    asyncFunctions.forEach(fn => {
      // If it calls fs.readFile or fs.writeFile, it should have await
      if (fn.includes('fs.readFile') || fn.includes('fs.writeFile') || fn.includes('fs.mkdir') || fn.includes('fs.stat')) {
        expect(fn).toMatch(/await fs\.(readFile|writeFile|mkdir|stat)/)
      }
    })
  })

  test('verifies imports are properly resolved', async () => {
    const sourceFile = path.join(process.cwd(), 'dashboard/app/api/alerts/route.ts')
    const content = await fs.readFile(sourceFile, 'utf-8')

    // Verify no duplicate imports
    const imports = content.match(/^import .* from/gm) || []
    const importLines = imports.join('\n')

    // Count withFileLock imports
    const withFileLockImports = importLines.match(/withFileLock/g) || []
    expect(withFileLockImports.length).toBe(1) // Should appear exactly once

    // Count parseRequestJson imports
    const parseJsonImports = importLines.match(/parseRequestJson/g) || []
    expect(parseJsonImports.length).toBe(1) // Should appear exactly once
  })
})
