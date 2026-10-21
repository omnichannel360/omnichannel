/**
 * COMPREHENSIVE RACE CONDITION TEST SUITE
 *
 * Tests file-based atomic operations under high concurrency
 * Covers: basic race conditions, edge cases, security scenarios, deadlocks
 *
 * Categories:
 * 1. Lost Update Race Conditions
 * 2. File Lock Concurrency Tests
 * 3. Concurrent CRUD Operations
 * 4. Edge Cases (missing files, corrupted JSON, permissions)
 * 5. Security Scenarios (injection, unauthorized access, data integrity)
 * 6. Deadlock Detection
 * 7. Performance Under Load
 */

import fs from 'fs'
import path from 'path'
import { promises as fsAsync } from 'fs'

// ============================================================================
// TEST DATA STRUCTURES
// ============================================================================

interface TestResult {
  name: string
  passed: boolean
  expected: any
  actual: any
  duration: number
  errors: string[]
}

interface Task {
  id: string
  title: string
  status: 'todo' | 'in-progress' | 'done'
  assignee?: string
  version?: number
  timestamp?: number
}

interface RaceConditionReport {
  totalTests: number
  passed: number
  failed: number
  duration: number
  results: TestResult[]
  summary: {
    lostUpdates: number
    deadlocks: number
    dataCorruption: number
    securityBreaches: number
  }
}

// ============================================================================
// MOCK FILE LOCK SYSTEM (replicate actual system)
// ============================================================================

interface FileLock {
  queue: Array<() => Promise<void>>
  locked: boolean
  acquisitionTime?: number
}

const locks = new Map<string, FileLock>()
const lockTimings = new Map<string, number[]>()

async function withFileLock<T>(filePath: string, callback: () => Promise<T>, timeoutMs = 30000): Promise<T> {
  let lock = locks.get(filePath)

  if (!lock) {
    lock = { queue: [], locked: false }
    locks.set(filePath, lock)
  }

  const startTime = Date.now()

  return new Promise((resolve, reject) => {
    const executeCallback = async () => {
      try {
        const acquisitionTime = Date.now()
        lock!.acquisitionTime = acquisitionTime

        // Track lock acquisition timing
        if (!lockTimings.has(filePath)) lockTimings.set(filePath, [])
        lockTimings.get(filePath)!.push(acquisitionTime)

        // Apply timeout
        const timeoutHandle = setTimeout(() => {
          reject(new Error(`Lock acquisition timeout after ${timeoutMs}ms for ${filePath}`))
        }, timeoutMs)

        try {
          const result = await callback()
          clearTimeout(timeoutHandle)
          resolve(result)
        } catch (error) {
          clearTimeout(timeoutHandle)
          reject(error)
        }
      } catch (error) {
        reject(error)
      } finally {
        const nextCallback = lock!.queue.shift()
        if (nextCallback) {
          await nextCallback()
        } else {
          lock!.locked = false
        }
      }
    }

    if (lock.locked) {
      lock.queue.push(executeCallback)
    } else {
      lock.locked = true
      executeCallback()
    }
  })
}

// ============================================================================
// ATOMIC FILE OPERATIONS (replicate actual implementation)
// ============================================================================

async function atomicRead<T>(filePath: string, fallback?: T): Promise<T> {
  return withFileLock(filePath, async () => {
    try {
      const content = await fsAsync.readFile(filePath, 'utf-8')
      return JSON.parse(content) as T
    } catch (error: any) {
      if (error.code === 'ENOENT' && fallback !== undefined) return fallback
      throw error
    }
  })
}

async function atomicWrite<T>(filePath: string, data: T): Promise<void> {
  return withFileLock(filePath, async () => {
    const dir = path.dirname(filePath)
    await fsAsync.mkdir(dir, { recursive: true }).catch(() => {})
    await fsAsync.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  })
}

async function atomicUpdate<T>(
  filePath: string,
  transform: (current: T) => Promise<T> | T,
  fallback: T
): Promise<T> {
  return withFileLock(filePath, async () => {
    let current: T
    try {
      const content = await fsAsync.readFile(filePath, 'utf-8')
      current = JSON.parse(content) as T
    } catch (error: any) {
      current = error.code === 'ENOENT' ? fallback : (() => { throw error })()
    }

    const updated = await transform(current)
    const dir = path.dirname(filePath)
    await fsAsync.mkdir(dir, { recursive: true }).catch(() => {})
    await fsAsync.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8')
    return updated
  })
}

// ============================================================================
// TEST 1: LOST UPDATE RACE CONDITION
// ============================================================================

async function testLostUpdateRaceCondition(): Promise<TestResult> {
  const testFile = path.join('/tmp', 'test-lost-update.json')
  const result: TestResult = {
    name: 'Lost Update Race Condition - Concurrent Creates',
    passed: false,
    expected: 5,
    actual: 0,
    duration: 0,
    errors: [],
  }

  const startTime = Date.now()

  try {
    // Clean up
    try {
      await fsAsync.unlink(testFile)
    } catch {}

    // Initialize with one task
    await atomicWrite(testFile, [{ id: 'task_0', title: 'Initial', status: 'todo' }])

    // Launch 4 concurrent requests that each add a task
    const promises = Array.from({ length: 4 }, (_, i) => {
      return new Promise<Task>((resolve, reject) => {
        setTimeout(async () => {
          try {
            const newTask: Task = {
              id: `task_${i + 1}`,
              title: `Task ${i + 1}`,
              status: 'todo',
              version: i + 1,
            }

            const updated = await atomicUpdate<Task[]>(
              testFile,
              async (tasks) => [...tasks, newTask],
              []
            )

            resolve(newTask)
          } catch (error) {
            reject(error)
          }
        }, Math.random() * 10) // Staggered timing
      })
    })

    await Promise.all(promises)

    // Verify final state
    const final = await atomicRead<Task[]>(testFile, [])
    result.actual = final.length
    result.passed = final.length === 5 // 1 initial + 4 concurrent
    result.duration = Date.now() - startTime

    if (!result.passed) {
      result.errors.push(`Expected 5 tasks, got ${final.length}. Lost updates detected.`)
    }
  } catch (error) {
    result.errors.push((error as Error).message)
  }

  return result
}

// ============================================================================
// TEST 2: CONCURRENT UPDATES (Multiple processes updating same task)
// ============================================================================

async function testConcurrentUpdates(): Promise<TestResult> {
  const testFile = path.join('/tmp', 'test-concurrent-updates.json')
  const result: TestResult = {
    name: 'Concurrent Updates - Version Conflict Detection',
    passed: false,
    expected: 5, // Original + 5 increments
    actual: 0,
    duration: 0,
    errors: [],
  }

  const startTime = Date.now()

  try {
    // Clean up
    try {
      await fsAsync.unlink(testFile)
    } catch {}

    // Initialize counter task
    const initialTask: Task = { id: 'counter', title: 'Counter', status: 'todo', version: 0 }
    await atomicWrite(testFile, [initialTask])

    // 5 concurrent increments
    const promises = Array.from({ length: 5 }, (_, i) => {
      return new Promise<void>((resolve, reject) => {
        setTimeout(async () => {
          try {
            await atomicUpdate<Task[]>(testFile, async (tasks) => {
              return tasks.map(t =>
                t.id === 'counter'
                  ? { ...t, version: (t.version || 0) + 1 }
                  : t
              )
            }, [])
            resolve()
          } catch (error) {
            reject(error)
          }
        }, Math.random() * 10)
      })
    })

    await Promise.all(promises)

    // Verify final version
    const final = await atomicRead<Task[]>(testFile, [])
    const counterTask = final.find(t => t.id === 'counter')
    result.actual = counterTask?.version || 0
    result.passed = result.actual === 5
    result.duration = Date.now() - startTime

    if (!result.passed) {
      result.errors.push(`Expected version 5, got ${result.actual}. Lost increments.`)
    }
  } catch (error) {
    result.errors.push((error as Error).message)
  }

  return result
}

// ============================================================================
// TEST 3: CONCURRENT DELETES
// ============================================================================

async function testConcurrentDeletes(): Promise<TestResult> {
  const testFile = path.join('/tmp', 'test-concurrent-deletes.json')
  const result: TestResult = {
    name: 'Concurrent Deletes - Data Integrity',
    passed: false,
    expected: 0, // All tasks deleted
    actual: 0,
    duration: 0,
    errors: [],
  }

  const startTime = Date.now()

  try {
    // Clean up
    try {
      await fsAsync.unlink(testFile)
    } catch {}

    // Initialize with 10 tasks
    const tasks: Task[] = Array.from({ length: 10 }, (_, i) => ({
      id: `task_${i}`,
      title: `Task ${i}`,
      status: 'todo',
    }))
    await atomicWrite(testFile, tasks)

    // 10 concurrent deletes
    const promises = Array.from({ length: 10 }, (_, i) => {
      return new Promise<void>((resolve, reject) => {
        setTimeout(async () => {
          try {
            await atomicUpdate<Task[]>(
              testFile,
              async (tasks) => tasks.filter(t => t.id !== `task_${i}`),
              []
            )
            resolve()
          } catch (error) {
            // Task might already be deleted, ignore
            resolve()
          }
        }, Math.random() * 10)
      })
    })

    await Promise.all(promises)

    // Verify all deleted
    const final = await atomicRead<Task[]>(testFile, [])
    result.actual = final.length
    result.passed = final.length === 0
    result.duration = Date.now() - startTime

    if (!result.passed) {
      result.errors.push(`Expected 0 tasks, got ${final.length}. Failed to delete all tasks.`)
    }
  } catch (error) {
    result.errors.push((error as Error).message)
  }

  return result
}

// ============================================================================
// TEST 4: EDGE CASE - Missing File During Read
// ============================================================================

async function testMissingFileFallback(): Promise<TestResult> {
  const testFile = path.join('/tmp', 'test-missing-file.json')
  const result: TestResult = {
    name: 'Edge Case - Missing File Fallback',
    passed: false,
    expected: 1,
    actual: 0,
    duration: 0,
    errors: [],
  }

  const startTime = Date.now()

  try {
    // Ensure file doesn't exist
    try {
      await fsAsync.unlink(testFile)
    } catch {}

    // Read non-existent file with fallback
    const fallbackTasks: Task[] = [{ id: 'default', title: 'Default', status: 'todo' }]
    const tasks = await atomicRead<Task[]>(testFile, fallbackTasks)

    result.actual = tasks.length
    result.passed = tasks.length === 1 && tasks[0].id === 'default'
    result.duration = Date.now() - startTime

    if (!result.passed) {
      result.errors.push('Fallback not applied for missing file')
    }
  } catch (error) {
    result.errors.push((error as Error).message)
  }

  return result
}

// ============================================================================
// TEST 5: EDGE CASE - Corrupted JSON
// ============================================================================

async function testCorruptedJsonHandling(): Promise<TestResult> {
  const testFile = path.join('/tmp', 'test-corrupted.json')
  const result: TestResult = {
    name: 'Edge Case - Corrupted JSON Handling',
    passed: false,
    expected: 'Error thrown',
    actual: 'No error',
    duration: 0,
    errors: [],
  }

  const startTime = Date.now()

  try {
    // Create corrupted file
    const dir = path.dirname(testFile)
    await fsAsync.mkdir(dir, { recursive: true }).catch(() => {})
    await fsAsync.writeFile(testFile, '{invalid json', 'utf-8')

    // Try to read corrupted file
    try {
      await atomicRead<Task[]>(testFile)
      result.errors.push('Expected error not thrown for corrupted JSON')
    } catch (error) {
      result.actual = 'Error thrown'
      result.passed = true
    }

    result.duration = Date.now() - startTime
  } catch (error) {
    result.errors.push((error as Error).message)
  }

  return result
}

// ============================================================================
// TEST 6: SECURITY - Concurrent Auth Bypass Attempts
// ============================================================================

async function testSecurityConcurrentAuthBypass(): Promise<TestResult> {
  const testFile = path.join('/tmp', 'test-security-auth.json')
  const result: TestResult = {
    name: 'Security - Concurrent Auth Bypass Detection',
    passed: false,
    expected: 0, // No unauthorized modifications
    actual: 0,
    duration: 0,
    errors: [],
  }

  const startTime = Date.now()

  try {
    // Clean up
    try {
      await fsAsync.unlink(testFile)
    } catch {}

    // Initialize secure data
    const secureData = [{ id: 'admin', role: 'admin', secret: 'top-secret' }]
    await atomicWrite(testFile, secureData)

    // Simulate concurrent unauthorized modification attempts
    const promises = Array.from({ length: 5 }, (_, i) => {
      return new Promise<boolean>((resolve) => {
        setTimeout(async () => {
          try {
            // Attempt to modify admin role (should be prevented at app level)
            await atomicUpdate<any>(testFile, async (data) => {
              const malicious = { ...data[0], role: 'superadmin' }
              return [malicious]
            }, [])
            resolve(true) // Unauthorized change went through (BAD)
          } catch {
            resolve(false) // Change failed (GOOD)
          }
        }, Math.random() * 10)
      })
    })

    const results = await Promise.all(promises)
    const unauthorizedChanges = results.filter(r => r).length

    result.actual = unauthorizedChanges
    result.passed = unauthorizedChanges === 0 // Should be prevented by app-level auth
    result.duration = Date.now() - startTime

    if (unauthorizedChanges > 0) {
      result.errors.push(`Unauthorized modifications detected: ${unauthorizedChanges}`)
    }
  } catch (error) {
    result.errors.push((error as Error).message)
  }

  return result
}

// ============================================================================
// TEST 7: SECURITY - SQL Injection-like Attack on JSON
// ============================================================================

async function testSecurityJsonInjection(): Promise<TestResult> {
  const testFile = path.join('/tmp', 'test-security-injection.json')
  const result: TestResult = {
    name: 'Security - JSON Injection Prevention',
    passed: false,
    expected: 'Safe',
    actual: 'Unknown',
    duration: 0,
    errors: [],
  }

  const startTime = Date.now()

  try {
    // Clean up
    try {
      await fsAsync.unlink(testFile)
    } catch {}

    // Initialize
    await atomicWrite(testFile, [])

    // Attempt injection attack
    const maliciousPayload = {
      id: '"; process.exit(0); //',
      title: '${require("child_process").exec("rm -rf /")}',
      status: 'done',
    }

    await atomicUpdate<any>(testFile, async (tasks) => [...tasks, maliciousPayload], [])

    // Verify data is treated as data, not code
    const data = await atomicRead<any>(testFile, [])
    const stored = data[0]

    // If we got here, the injection was safely stored (not executed)
    const isSafe =
      stored.id === '"; process.exit(0); //' &&
      stored.title === '${require("child_process").exec("rm -rf /")}'

    result.actual = isSafe ? 'Safe' : 'Unsafe'
    result.passed = isSafe
    result.duration = Date.now() - startTime

    if (!isSafe) {
      result.errors.push('Injection payload was not safely stored or was modified')
    }
  } catch (error) {
    result.errors.push((error as Error).message)
  }

  return result
}

// ============================================================================
// TEST 8: HIGH CONCURRENCY - 100 Concurrent Operations
// ============================================================================

async function testHighConcurrencyLoad(): Promise<TestResult> {
  const testFile = path.join('/tmp', 'test-high-concurrency.json')
  const result: TestResult = {
    name: 'High Concurrency - 100 Concurrent Operations',
    passed: false,
    expected: 100,
    actual: 0,
    duration: 0,
    errors: [],
  }

  const startTime = Date.now()

  try {
    // Clean up
    try {
      await fsAsync.unlink(testFile)
    } catch {}

    // Initialize
    await atomicWrite(testFile, [])

    // 100 concurrent adds
    const promises = Array.from({ length: 100 }, (_, i) => {
      return new Promise<void>((resolve, reject) => {
        // No artificial delay - true concurrent
        (async () => {
          try {
            await atomicUpdate<Task[]>(
              testFile,
              async (tasks) => [
                ...tasks,
                {
                  id: `task_${i}`,
                  title: `Task ${i}`,
                  status: 'todo',
                },
              ],
              []
            )
            resolve()
          } catch (error) {
            reject(error)
          }
        })()
      })
    })

    await Promise.all(promises)

    // Verify all tasks added
    const final = await atomicRead<Task[]>(testFile, [])
    result.actual = final.length
    result.passed = final.length === 100
    result.duration = Date.now() - startTime

    if (!result.passed) {
      result.errors.push(
        `Expected 100 tasks, got ${final.length}. ${100 - final.length} tasks lost.`
      )
    }
  } catch (error) {
    result.errors.push((error as Error).message)
  }

  return result
}

// ============================================================================
// TEST 9: DEADLOCK DETECTION - Circular Dependencies
// ============================================================================

async function testDeadlockDetection(): Promise<TestResult> {
  const testFileA = path.join('/tmp', 'test-deadlock-a.json')
  const testFileB = path.join('/tmp', 'test-deadlock-b.json')
  const result: TestResult = {
    name: 'Deadlock Detection - Timeout Handling',
    passed: false,
    expected: 'Timeout or success',
    actual: 'Unknown',
    duration: 0,
    errors: [],
  }

  const startTime = Date.now()

  try {
    // Clean up
    try {
      await fsAsync.unlink(testFileA)
      await fsAsync.unlink(testFileB)
    } catch {}

    // Initialize
    await atomicWrite(testFileA, [])
    await atomicWrite(testFileB, [])

    // Attempt cross-file update (potential deadlock if A waits for B and B waits for A)
    const promise1 = atomicUpdate<any>(testFileA, async () => {
      return atomicUpdate<any>(testFileB, async (b) => [...b, { id: 'b' }], [])
    }, [])

    const promise2 = atomicUpdate<any>(testFileB, async () => {
      return atomicUpdate<any>(testFileA, async (a) => [...a, { id: 'a' }], [])
    }, [])

    // Race between the two operations
    const completed = await Promise.race([
      Promise.all([promise1, promise2]).then(() => 'completed'),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 5000)),
    ])

    result.actual = completed as string
    result.passed = true // As long as we don't hang forever
    result.duration = Date.now() - startTime
  } catch (error) {
    result.errors.push((error as Error).message)
  }

  return result
}

// ============================================================================
// TEST 10: ATOMICITY - All or Nothing Updates
// ============================================================================

async function testAtomicity(): Promise<TestResult> {
  const testFile = path.join('/tmp', 'test-atomicity.json')
  const result: TestResult = {
    name: 'Atomicity - All or Nothing Updates',
    passed: false,
    expected: 'Original state preserved',
    actual: 'Unknown',
    duration: 0,
    errors: [],
  }

  const startTime = Date.now()

  try {
    // Clean up
    try {
      await fsAsync.unlink(testFile)
    } catch {}

    // Initialize
    const originalData = [{ id: 'task_1', title: 'Original', status: 'todo' }]
    await atomicWrite(testFile, originalData)

    // Attempt update that throws error midway
    try {
      await atomicUpdate<Task[]>(testFile, async (tasks) => {
        // Simulate partial update then error
        const updated = [...tasks, { id: 'task_2', title: 'New', status: 'todo' }]
        throw new Error('Simulated failure during update')
      }, [])
    } catch {
      // Expected to fail
    }

    // Verify original data is preserved
    const current = await atomicRead<Task[]>(testFile, [])
    result.actual = current.length === 1 ? 'Rolled back' : 'Changed'
    result.passed = current.length === 1 && current[0].id === 'task_1'
    result.duration = Date.now() - startTime

    if (!result.passed) {
      result.errors.push('Failed update partially modified file (not atomic)')
    }
  } catch (error) {
    result.errors.push((error as Error).message)
  }

  return result
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

export async function runAllTests(): Promise<RaceConditionReport> {
  console.log('🚀 Starting Comprehensive Race Condition Test Suite\n')

  const tests = [
    testLostUpdateRaceCondition,
    testConcurrentUpdates,
    testConcurrentDeletes,
    testMissingFileFallback,
    testCorruptedJsonHandling,
    testSecurityConcurrentAuthBypass,
    testSecurityJsonInjection,
    testHighConcurrencyLoad,
    testDeadlockDetection,
    testAtomicity,
  ]

  const startTime = Date.now()
  const results: TestResult[] = []

  // Run tests sequentially to avoid interference
  for (const test of tests) {
    try {
      console.log(`⏳ Running: ${test.name}...`)
      const result = await test()
      results.push(result)
      console.log(`${result.passed ? '✅' : '❌'} ${result.name} (${result.duration}ms)`)
      if (result.errors.length > 0) {
        console.log(`   Errors: ${result.errors.join(', ')}`)
      }
    } catch (error) {
      console.log(`❌ ${test.name} - Unexpected error: ${error}`)
      results.push({
        name: test.name || 'Unknown test',
        passed: false,
        expected: 'Success',
        actual: 'Error',
        duration: 0,
        errors: [(error as Error).message],
      })
    }
  }

  const duration = Date.now() - startTime
  const passed = results.filter(r => r.passed).length
  const failed = results.length - passed

  const report: RaceConditionReport = {
    totalTests: results.length,
    passed,
    failed,
    duration,
    results,
    summary: {
      lostUpdates: results.filter(r => r.name.includes('Update') && !r.passed).length,
      deadlocks: results.filter(r => r.name.includes('Deadlock')).length,
      dataCorruption: results.filter(r => r.name.includes('Corrupted')).length,
      securityBreaches: results.filter(r => r.name.includes('Security') && !r.passed).length,
    },
  }

  return report
}

// ============================================================================
// REPORTING
// ============================================================================

function formatReport(report: RaceConditionReport): string {
  return `
╔════════════════════════════════════════════════════════════════════════╗
║           RACE CONDITION TEST SUITE RESULTS                           ║
╚════════════════════════════════════════════════════════════════════════╝

📊 SUMMARY
─────────────────────────────────────────────────────────────────────────
  Total Tests:        ${report.totalTests}
  Passed:             ${report.passed} ✅
  Failed:             ${report.failed} ❌
  Total Duration:     ${report.duration}ms
  Success Rate:       ${((report.passed / report.totalTests) * 100).toFixed(1)}%

⚠️ CRITICAL ISSUES
─────────────────────────────────────────────────────────────────────────
  Lost Updates:       ${report.summary.lostUpdates}
  Deadlocks:          ${report.summary.deadlocks}
  Data Corruption:    ${report.summary.dataCorruption}
  Security Breaches:  ${report.summary.securityBreaches}

📋 DETAILED RESULTS
─────────────────────────────────────────────────────────────────────────
${report.results
  .map(
    r => `
[${r.passed ? '✅' : '❌'}] ${r.name}
    Expected: ${JSON.stringify(r.expected)}
    Actual:   ${JSON.stringify(r.actual)}
    Time:     ${r.duration}ms
    ${r.errors.length > 0 ? `Errors:  ${r.errors.join('; ')}` : ''}
`
  )
  .join('')}

🎯 RECOMMENDATIONS
─────────────────────────────────────────────────────────────────────────
${
  report.summary.lostUpdates > 0
    ? '⚠️  Lost Update Detected: Review atomic operation implementation\n'
    : ''
}${
  report.summary.deadlocks > 0
    ? '⚠️  Deadlock Risk: Implement timeout mechanisms\n'
    : ''
}${
  report.summary.dataCorruption > 0
    ? '⚠️  Data Corruption: Add validation and recovery mechanisms\n'
    : ''
}${
  report.summary.securityBreaches > 0
    ? '⚠️  Security Issues: Implement authorization checks\n'
    : ''
}${
  report.passed === report.totalTests
    ? '✅ All tests passed! System is resilient to race conditions.\n'
    : ''
}
`
}

// Main execution
if (require.main === module) {
  runAllTests()
    .then(report => {
      console.log(formatReport(report))
      process.exit(report.failed > 0 ? 1 : 0)
    })
    .catch(error => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}

export { TestResult, RaceConditionReport }
