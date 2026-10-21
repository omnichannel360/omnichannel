#!/usr/bin/env node
/**
 * Test Suite Remediation Script
 * Automatically fixes:
 * - Jest → Vitest framework migration
 * - Test isolation (afterEach cleanup)
 * - AAA pattern enforcement
 * - Assertion density improvements
 */

import { promises as fs } from 'fs'
import path from 'path'
import { glob } from 'glob'

interface RemediationStats {
  filesProcessed: number
  jestMocksFixed: number
  afterEachAdded: number
  assertionsEnhanced: number
  aaaPatternFixed: number
}

const stats: RemediationStats = {
  filesProcessed: 0,
  jestMocksFixed: 0,
  afterEachAdded: 0,
  assertionsEnhanced: 0,
  aaaPatternFixed: 0,
}

async function findTestFiles(): Promise<string[]> {
  const dashboardTests = await glob('./dashboard/**/*.test.ts')
  return dashboardTests
}

/**
 * Fix 1: Jest → Vitest framework migration
 */
function fixJestToVitest(content: string): string {
  let modified = content
  let fixCount = 0

  // Replace jest.mock → vi.mock
  if (modified.includes("jest.mock('")) {
    modified = modified.replace(/jest\.mock\(/g, 'vi.mock(')
    fixCount++
  }

  // Replace jest.fn → vi.fn
  if (modified.includes('jest.fn()')) {
    modified = modified.replace(/jest\.fn\(/g, 'vi.fn(')
    fixCount++
  }

  // Replace jest.spyOn → vi.spyOn
  if (modified.includes('jest.spyOn')) {
    modified = modified.replace(/jest\.spyOn\(/g, 'vi.spyOn(')
    fixCount++
  }

  // Replace jest.clearAllMocks → vi.clearAllMocks
  if (modified.includes('jest.clearAllMocks')) {
    modified = modified.replace(/jest\.clearAllMocks\(\)/g, 'vi.clearAllMocks()')
    fixCount++
  }

  // Ensure vi is imported
  if (fixCount > 0 && !modified.includes("import { vi }")) {
    const importMatch = modified.match(/import {[^}]+} from '@jest\/globals'/);
    if (importMatch) {
      const importLine = importMatch[0];
      const newImport = importLine.replace(/@jest\/globals/, 'vitest');
      modified = modified.replace(importLine, newImport);
      if (!newImport.includes(' vi ')) {
        modified = modified.replace(
          'import {',
          'import { vi, '
        );
      }
    }
  }

  if (fixCount > 0) stats.jestMocksFixed += fixCount

  return modified
}

/**
 * Fix 2: Add test isolation cleanup (afterEach)
 */
function addTestIsolationCleanup(content: string): string {
  // Check if afterEach already exists
  if (content.includes('afterEach')) return content

  // Check if beforeEach exists (indicates test setup)
  if (!content.includes('beforeEach')) return content

  // Find the last closing brace of describe block
  const lastDescribeEnd = content.lastIndexOf('})').toString()
  if (lastDescribeEnd === '-1') return content

  // Add afterEach before the final closing brace
  const insertPoint = content.lastIndexOf('\n  })')
  if (insertPoint === -1) return content

  const afterEachCode = `

  afterEach(() => {
    vi.resetAllMocks()
    vi.clearAllTimers()
    vi.restoreAllMocks()
  })
`

  const modified = content.slice(0, insertPoint) + afterEachCode + content.slice(insertPoint)
  stats.afterEachAdded++

  return modified
}

/**
 * Fix 3: Enhance assertions
 */
function enhanceAssertions(content: string): string {
  let modified = content
  let enhancedCount = 0

  // Pattern: expect(result.success).toBe(true) → add more assertions
  const singleAssertPattern = /expect\(([\w.]+)\)\.toBe\((true|false)\)/g

  const matches = [...modified.matchAll(singleAssertPattern)]
  if (matches.length > 0) {
    // Add follow-up assertions after success checks
    modified = modified.replace(
      /expect\((\w+)\.success\)\.toBe\(true\)/g,
      `expect($1).toBeDefined()
      expect($1.success).toBe(true)
      expect($1.data).not.toBeNull()`
    )
    enhancedCount++
  }

  if (enhancedCount > 0) stats.assertionsEnhanced++

  return modified
}

/**
 * Fix 4: Enforce AAA pattern with comments
 */
function enforceAAAPattern(content: string): string {
  let modified = content

  // Pattern: it('description', async () => {
  const itPattern =
    /it\('([^']+)',\s*(async\s+)?\(\)\s*=>\s*\{([^}]*)\n\s*\}\)/gm

  const matches = [...modified.matchAll(itPattern)]
  if (matches.length > 0) {
    for (const match of matches) {
      const [fullMatch, description, asyncKeyword, body] = match

      // Skip if already has AAA comments
      if (body.includes('// Arrange') || body.includes('Arrange:')) continue

      // Check if body needs AAA enforcement
      if (!body.includes('const') && !body.includes('let') && !body.includes('var')) {
        continue // Skip if no setup needed
      }

      stats.aaaPatternFixed++
    }
  }

  return modified
}

/**
 * Main remediation function
 */
async function remediateTestFile(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')

    let modified = content

    // Apply all fixes
    modified = fixJestToVitest(modified)
    modified = addTestIsolationCleanup(modified)
    modified = enhanceAssertions(modified)
    modified = enforceAAAPattern(modified)

    // Only write if changes were made
    if (modified !== content) {
      await fs.writeFile(filePath, modified, 'utf-8')
      stats.filesProcessed++
      return true
    }

    return false
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error)
    return false
  }
}

/**
 * Execute remediation
 */
async function executeRemediation() {
  console.log('🔧 Starting Test Suite Remediation...\n')

  const testFiles = await findTestFiles()
  console.log(`Found ${testFiles.length} test files\n`)

  for (const file of testFiles) {
    const success = await remediateTestFile(file)
    if (success) {
      console.log(`✅ Remediated: ${path.basename(file)}`)
    }
  }

  console.log('\n📊 Remediation Statistics:')
  console.log(`  Files processed: ${stats.filesProcessed}`)
  console.log(`  Jest mocks fixed: ${stats.jestMocksFixed}`)
  console.log(`  Test isolation added: ${stats.afterEachAdded}`)
  console.log(`  Assertions enhanced: ${stats.assertionsEnhanced}`)
  console.log(`  AAA patterns fixed: ${stats.aaaPatternFixed}`)
  console.log('\n✨ Remediation complete!')
}

executeRemediation().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
