import fs from 'fs'
import path from 'path'

/**
 * Demonstrates TOCTOU race condition in file-based storage.
 * This test simulates the exact pattern used in the API routes.
 */

const TEST_FILE = '/tmp/test-race.json'

interface Task {
  id: string
  value: number
}

// Simulates the loadTasks function from kanban/route.ts
function loadTasks(): Task[] {
  try {
    const data = fs.readFileSync(TEST_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

// Simulates the saveTasks function from kanban/route.ts
function saveTasks(tasks: Task[]) {
  fs.writeFileSync(TEST_FILE, JSON.stringify(tasks, null, 2))
}

// Simulates a concurrent request handler
async function processRequest(requestId: number, delay: number): Promise<Task> {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Read
      const tasks = loadTasks()
      const newTask: Task = {
        id: `task_${requestId}`,
        value: requestId,
      }

      // Modify
      tasks.push(newTask)

      // Write
      saveTasks(tasks)

      resolve(newTask)
    }, delay)
  })
}

async function runTest() {
  // Initialize with one task
  fs.writeFileSync(TEST_FILE, JSON.stringify([{ id: 'initial', value: 0 }], null, 2))

  console.log('Initial state:', JSON.parse(fs.readFileSync(TEST_FILE, 'utf-8')))

  // Launch two concurrent requests with staggered timing
  // This creates a window where both see the old file state
  const promise1 = processRequest(1, 10)
  const promise2 = processRequest(2, 15)

  await Promise.all([promise1, promise2])

  const final = JSON.parse(fs.readFileSync(TEST_FILE, 'utf-8'))
  console.log('Final state:', final)
  console.log('Final count:', final.length)

  // RACE CONDITION VERDICT:
  // Expected: 3 tasks (initial + request1 + request2)
  // Vulnerable: 2 tasks (one request overwrites the other's changes)
  if (final.length === 3) {
    console.log('✅ NO RACE CONDITION DETECTED in this run (got lucky with timing)')
  } else if (final.length === 2) {
    console.log('❌ RACE CONDITION CONFIRMED: Lost update detected (2 tasks instead of 3)')
  }

  // Cleanup
  fs.unlinkSync(TEST_FILE)
}

runTest().catch(console.error)
