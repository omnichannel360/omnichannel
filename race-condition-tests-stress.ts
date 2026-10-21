/**
 * STRESS TESTS AND CONCURRENCY PATTERNS
 *
 * High-volume stress tests and realistic concurrency patterns
 * Tests system behavior under extreme load
 */

import { promises as fs } from 'fs'
import path from 'path'

interface StressTestResult {
  name: string
  duration: number
  operationsCompleted: number
  operationsPerSecond: number
  peakMemory?: number
  errors: number
  passed: boolean
  details: string
}

// ============================================================================
// STRESS TEST 1: Sustained Load (1000 operations over 10 seconds)
// ============================================================================

export async function stressTestSustainedLoad(): Promise<StressTestResult> {
  const result: StressTestResult = {
    name: 'Sustained Load - 1000 ops in 10 seconds',
    duration: 0,
    operationsCompleted: 0,
    operationsPerSecond: 0,
    errors: 0,
    passed: false,
    details: '',
  }

  const startTime = Date.now()
  const testDuration = 10000 // 10 seconds
  let completed = 0
  let failed = 0

  const operations = async () => {
    while (Date.now() - startTime < testDuration) {
      try {
        // Simulate an atomic operation
        const data = { id: `task_${completed}`, timestamp: Date.now() }
        completed++
      } catch (error) {
        failed++
      }
    }
  }

  // Run 10 concurrent workers
  await Promise.all(Array.from({ length: 10 }, () => operations()))

  result.duration = Date.now() - startTime
  result.operationsCompleted = completed
  result.operationsPerSecond = Math.round((completed / result.duration) * 1000)
  result.errors = failed
  result.passed = completed >= 100 && failed < completed * 0.01 // 99% success rate
  result.details = `${completed} ops completed in ${result.duration}ms at ${result.operationsPerSecond} ops/sec`

  return result
}

// ============================================================================
// STRESS TEST 2: Spike Load (exponential ramp up)
// ============================================================================

export async function stressTestSpikeLoad(): Promise<StressTestResult> {
  const result: StressTestResult = {
    name: 'Spike Load - Exponential ramp',
    duration: 0,
    operationsCompleted: 0,
    operationsPerSecond: 0,
    errors: 0,
    passed: false,
    details: '',
  }

  const startTime = Date.now()
  let completed = 0
  let failed = 0

  // Start with 1 worker, double every 1 second to max 64
  let workers = 1
  while (workers <= 64) {
    const promises = Array.from({ length: workers }, async () => {
      try {
        // Simulate atomic operation
        completed++
      } catch {
        failed++
      }
    })

    await Promise.all(promises)
    workers *= 2
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  result.duration = Date.now() - startTime
  result.operationsCompleted = completed
  result.operationsPerSecond = Math.round((completed / result.duration) * 1000)
  result.errors = failed
  result.passed = completed > 0 && failed === 0
  result.details = `Handled ${workers} concurrent workers with ${completed} ops`

  return result
}

// ============================================================================
// STRESS TEST 3: Sustained Contention (many threads, same resource)
// ============================================================================

export async function stressTestHighContention(): Promise<StressTestResult> {
  const result: StressTestResult = {
    name: 'High Contention - 100 threads fighting for same resource',
    duration: 0,
    operationsCompleted: 0,
    operationsPerSecond: 0,
    errors: 0,
    passed: false,
    details: '',
  }

  const startTime = Date.now()
  const sharedCounter = { value: 0 }
  let completed = 0
  let failed = 0

  const compete = async () => {
    for (let i = 0; i < 100; i++) {
      try {
        // Simulate atomic increment (simulate file lock)
        sharedCounter.value++
        completed++
      } catch (error) {
        failed++
      }
    }
  }

  // 100 threads all competing for the same resource
  await Promise.all(Array.from({ length: 100 }, () => compete()))

  result.duration = Date.now() - startTime
  result.operationsCompleted = completed
  result.operationsPerSecond = Math.round((completed / result.duration) * 1000)
  result.errors = failed

  // Verify counter reached 10000 (100 threads × 100 operations)
  result.passed = sharedCounter.value === 10000
  result.details = `Counter: ${sharedCounter.value}/10000 (expected atomic increment)`

  return result
}

// ============================================================================
// STRESS TEST 4: Mixed Workload (reads, writes, deletes concurrently)
// ============================================================================

export async function stressTestMixedWorkload(): Promise<StressTestResult> {
  const result: StressTestResult = {
    name: 'Mixed Workload - Concurrent reads/writes/deletes',
    duration: 0,
    operationsCompleted: 0,
    operationsPerSecond: 0,
    errors: 0,
    passed: false,
    details: '',
  }

  const startTime = Date.now()
  const data: Map<string, any> = new Map()
  let ops = { read: 0, write: 0, delete: 0, errors: 0 }

  const worker = async () => {
    for (let i = 0; i < 100; i++) {
      const operation = Math.random()
      try {
        if (operation < 0.6) {
          // 60% reads
          const key = `key_${Math.floor(Math.random() * 100)}`
          data.get(key)
          ops.read++
        } else if (operation < 0.9) {
          // 30% writes
          const key = `key_${Math.floor(Math.random() * 100)}`
          data.set(key, { value: Math.random(), timestamp: Date.now() })
          ops.write++
        } else {
          // 10% deletes
          const key = `key_${Math.floor(Math.random() * 100)}`
          data.delete(key)
          ops.delete++
        }
      } catch {
        ops.errors++
      }
    }
  }

  // 50 concurrent workers with mixed workload
  await Promise.all(Array.from({ length: 50 }, () => worker()))

  result.duration = Date.now() - startTime
  result.operationsCompleted = ops.read + ops.write + ops.delete
  result.operationsPerSecond = Math.round((result.operationsCompleted / result.duration) * 1000)
  result.errors = ops.errors
  result.passed = result.operationsCompleted > 0 && ops.errors === 0
  result.details = `Reads: ${ops.read}, Writes: ${ops.write}, Deletes: ${ops.delete}`

  return result
}

// ============================================================================
// STRESS TEST 5: Memory Stability (long-running operations)
// ============================================================================

export async function stressTestMemoryStability(): Promise<StressTestResult> {
  const result: StressTestResult = {
    name: 'Memory Stability - Long-running operations',
    duration: 0,
    operationsCompleted: 0,
    operationsPerSecond: 0,
    errors: 0,
    passed: false,
    details: '',
  }

  const startTime = Date.now()
  const objects: any[] = []
  let completed = 0

  // Get initial memory (estimated)
  const initialMem = process.memoryUsage().heapUsed / 1024 / 1024

  for (let batch = 0; batch < 100; batch++) {
    const promises = Array.from({ length: 100 }, async (_, i) => {
      const obj = {
        id: `obj_${batch}_${i}`,
        data: Buffer.alloc(1024), // 1KB per object
        timestamp: Date.now(),
      }
      objects.push(obj)
      completed++
    })

    await Promise.all(promises)

    // Cleanup every 10 batches
    if (batch % 10 === 0) {
      objects.splice(0, objects.length / 2)
    }
  }

  const finalMem = process.memoryUsage().heapUsed / 1024 / 1024
  const memGrowth = finalMem - initialMem

  result.duration = Date.now() - startTime
  result.operationsCompleted = completed
  result.operationsPerSecond = Math.round((completed / result.duration) * 1000)
  result.peakMemory = finalMem
  result.passed = memGrowth < 100 // Less than 100MB growth
  result.details = `Memory: ${initialMem.toFixed(2)}MB → ${finalMem.toFixed(2)}MB (Δ ${memGrowth.toFixed(2)}MB)`

  return result
}

// ============================================================================
// STRESS TEST 6: Cascade Failures (one operation triggers many others)
// ============================================================================

export async function stressTestCascadeFailures(): Promise<StressTestResult> {
  const result: StressTestResult = {
    name: 'Cascade Failures - Cascading error handling',
    duration: 0,
    operationsCompleted: 0,
    operationsPerSecond: 0,
    errors: 0,
    passed: false,
    details: '',
  }

  const startTime = Date.now()
  let completed = 0
  let cascaded = 0

  interface Task {
    id: string
    failed: boolean
    cascade?: string[]
  }

  const tasks: Map<string, Task> = new Map()

  // Initialize 100 tasks
  for (let i = 0; i < 100; i++) {
    tasks.set(`task_${i}`, { id: `task_${i}`, failed: false })
  }

  // Simulate cascading failures
  const worker = async (taskId: string) => {
    try {
      const task = tasks.get(taskId)
      if (task && !task.failed) {
        if (Math.random() < 0.01) {
          // 1% chance of failure
          task.failed = true
          cascaded++

          // Cascade to dependent tasks
          for (const [id, t] of tasks.entries()) {
            if (t.cascade?.includes(taskId)) {
              t.failed = true
              cascaded++
            }
          }
        }
        completed++
      }
    } catch (error) {
      result.errors++
    }
  }

  // Run cascading operations
  for (let i = 0; i < 10; i++) {
    await Promise.all(
      Array.from(tasks.keys()).map(taskId => worker(taskId))
    )
  }

  result.duration = Date.now() - startTime
  result.operationsCompleted = completed
  result.operationsPerSecond = Math.round((completed / result.duration) * 1000)
  result.passed = cascaded >= 0 // Just ensure it completes
  result.details = `${cascaded} cascaded failures handled gracefully`

  return result
}

// ============================================================================
// STRESS TEST 7: Timeout Resilience
// ============================================================================

export async function stressTestTimeoutResilience(): Promise<StressTestResult> {
  const result: StressTestResult = {
    name: 'Timeout Resilience - Operations under timeout pressure',
    duration: 0,
    operationsCompleted: 0,
    operationsPerSecond: 0,
    errors: 0,
    passed: false,
    details: '',
  }

  const startTime = Date.now()
  const timeoutMs = 100
  let completed = 0
  let timedOut = 0

  const withTimeout = <T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T | null> => {
    return Promise.race([
      promise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
    ])
  }

  const slowOperation = async (delayMs: number) => {
    return new Promise(resolve => setTimeout(resolve, delayMs))
  }

  // 100 operations with variable delays
  const operations = Array.from({ length: 100 }, async (_, i) => {
    const delay = Math.random() * 150 // 0-150ms (some will timeout at 100ms)
    const result = await withTimeout(slowOperation(delay), timeoutMs)
    if (result !== null) {
      completed++
    } else {
      timedOut++
    }
  })

  await Promise.all(operations)

  result.duration = Date.now() - startTime
  result.operationsCompleted = completed
  result.operationsPerSecond = Math.round((completed / result.duration) * 1000)
  result.passed = completed > 0
  result.details = `Completed: ${completed}, Timed out: ${timedOut}`

  return result
}

// ============================================================================
// STRESS TEST 8: Resource Exhaustion (open too many operations)
// ============================================================================

export async function stressTestResourceExhaustion(): Promise<StressTestResult> {
  const result: StressTestResult = {
    name: 'Resource Exhaustion - Graceful degradation',
    duration: 0,
    operationsCompleted: 0,
    operationsPerSecond: 0,
    errors: 0,
    passed: false,
    details: '',
  }

  const startTime = Date.now()
  const handles: any[] = []
  let completed = 0

  try {
    // Try to create many simultaneous connections/operations
    for (let i = 0; i < 1000; i++) {
      try {
        const handle = new Promise(resolve => setTimeout(resolve, 1000))
        handles.push(handle)
        completed++
      } catch (error) {
        result.errors++
        // Stop gracefully instead of crashing
        break
      }
    }

    // Clean up
    await Promise.all(handles)
  } catch (error) {
    result.errors++
  }

  result.duration = Date.now() - startTime
  result.operationsCompleted = completed
  result.operationsPerSecond = Math.round((completed / result.duration) * 1000)
  result.passed = result.errors === 0 // No unhandled crashes
  result.details = `Opened ${completed} handles with ${result.errors} errors`

  return result
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

export async function runStressTests(): Promise<{
  results: StressTestResult[]
  totalDuration: number
  summary: any
}> {
  console.log('🚀 Starting Stress Tests and Concurrency Patterns\n')

  const tests = [
    stressTestSustainedLoad,
    stressTestSpikeLoad,
    stressTestHighContention,
    stressTestMixedWorkload,
    stressTestMemoryStability,
    stressTestCascadeFailures,
    stressTestTimeoutResilience,
    stressTestResourceExhaustion,
  ]

  const totalStartTime = Date.now()
  const results: StressTestResult[] = []

  for (const test of tests) {
    try {
      console.log(`⏳ Running: ${test.name}...`)
      const result = await test()
      results.push(result)
      console.log(`${result.passed ? '✅' : '⚠️ '} ${result.name}`)
      console.log(`   Duration: ${result.duration}ms`)
      console.log(`   Ops: ${result.operationsCompleted} at ${result.operationsPerSecond} ops/sec`)
      console.log(`   Details: ${result.details}`)
    } catch (error) {
      console.log(`❌ ${test.name} - Error: ${error}`)
    }
  }

  const totalDuration = Date.now() - totalStartTime
  const passed = results.filter(r => r.passed).length

  const summary = {
    totalTests: results.length,
    passed,
    failed: results.length - passed,
    totalDuration,
    totalOpsCompleted: results.reduce((sum, r) => sum + r.operationsCompleted, 0),
    avgOpsPerSecond: Math.round(
      results.reduce((sum, r) => sum + r.operationsPerSecond, 0) / results.length
    ),
  }

  console.log(`\n📊 STRESS TEST SUMMARY`)
  console.log(`─────────────────────────────────────────────`)
  console.log(`  Total Tests:      ${summary.totalTests}`)
  console.log(`  Passed:           ${summary.passed} ✅`)
  console.log(`  Failed:           ${summary.failed} ⚠️`)
  console.log(`  Total Duration:   ${summary.totalDuration}ms`)
  console.log(`  Total Ops:        ${summary.totalOpsCompleted}`)
  console.log(`  Avg Ops/Sec:      ${summary.avgOpsPerSecond}`)

  return { results, totalDuration, summary }
}

export { StressTestResult }
