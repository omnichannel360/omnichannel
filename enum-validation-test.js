/**
 * Test demonstrating unvalidated enum values in status fields
 * This shows that the API accepts invalid enum values
 */

// Test 1: PATCH endpoint accepts invalid status
function testAlertsPatchValidation() {
  console.log('\n=== Test 1: Alerts PATCH Endpoint ===')

  const invalidStatusValues = [
    'invalid',
    'pending',
    'archived',
    'deleted',
    'in_review',
    '',
    123
  ]

  // This mimics the PATCH handler code from alerts/route.ts:74-92
  const patchHandler = (alert_id, status) => {
    // Line 77-79: Only checks if status exists
    if (!alert_id || !status) {
      return { error: 'Missing required fields' }
    }

    // Line 88: DIRECTLY ASSIGNS without validation
    const alert = { id: alert_id, status }
    return { success: true, alert }
  }

  let vulnCount = 0
  invalidStatusValues.forEach(value => {
    const result = patchHandler('alert_1', value)
    if (result.success) {
      console.log(`✗ VULNERABILITY: Status "${value}" accepted (type: ${typeof value})`)
      vulnCount++
    }
  })
  return vulnCount
}

// Test 2: POST endpoint accepts invalid level
function testAlertsPostValidation() {
  console.log('\n=== Test 2: Alerts POST Endpoint ===')

  const invalidLevelValues = [
    'debug',
    'error',
    'fatal',
    'trace',
    'INFO',  // case mismatch
    123
  ]

  // This mimics the POST handler code from alerts/route.ts:58-72
  const postHandler = (level, component, message) => {
    // Line 61-63: Only checks if fields exist
    if (!level || !component || !message) {
      return { error: 'Missing required fields' }
    }

    // Line 65: DIRECTLY PASSES level without validation
    const alert = {
      id: `alert_${Date.now()}`,
      timestamp: new Date().toISOString(),
      level,  // NO VALIDATION
      component,
      message,
      status: 'active',
    }
    return { success: true, alert }
  }

  let vulnCount = 0
  invalidLevelValues.forEach(value => {
    const result = postHandler(value, 'test-component', 'test message')
    if (result.success) {
      console.log(`✗ VULNERABILITY: Level "${value}" accepted (type: ${typeof value})`)
      vulnCount++
    }
  })
  return vulnCount
}

// Test 3: Kanban POST endpoint accepts invalid status
function testKanbanPostValidation() {
  console.log('\n=== Test 3: Kanban POST Endpoint ===')

  const invalidStatusValues = [
    'completed',
    'pending',
    'blocked',
    'review',
    'archived',
    '',
    123
  ]

  // This mimics the POST handler code from kanban/route.ts:54-83
  const postHandler = (title, status = 'todo') => {
    // Line 59-63: Only checks if title exists
    if (!title) {
      return { error: 'Title required' }
    }

    // Line 70: DIRECTLY ASSIGNS status without validation
    const task = {
      id: Date.now().toString(),
      title,
      status,  // NO VALIDATION
    }

    return { success: true, data: task }
  }

  let vulnCount = 0
  invalidStatusValues.forEach(value => {
    const result = postHandler('Test Task', value)
    if (result.success) {
      console.log(`✗ VULNERABILITY: Status "${value}" accepted (type: ${typeof value})`)
      vulnCount++
    }
  })
  return vulnCount
}

// Test 4: Kanban PUT endpoint - completely open
function testKanbanPutValidation() {
  console.log('\n=== Test 4: Kanban PUT Endpoint ===')

  // This mimics the PUT handler code from kanban/route.ts:85-117
  const putHandler = (id, updates) => {
    if (!id) {
      return { error: 'ID required' }
    }

    const task = {
      id: '1',
      title: 'Original Task',
      status: 'todo'
    }

    // Line 107: Object.assign allows ANY properties
    Object.assign(task, updates)

    return { success: true, data: task }
  }

  const maliciousUpdates = [
    { status: 'super_invalid' },
    { status: 'archived', priority: 'xyz' },
    { status: 123, assignee: 'hacker' }
  ]

  let vulnCount = 0
  maliciousUpdates.forEach(updates => {
    const result = putHandler('task_1', updates)
    if (result.success) {
      console.log(`✗ VULNERABILITY: Updates ${JSON.stringify(updates)} accepted`)
      console.log(`    -> Final task: ${JSON.stringify(result.data)}`)
      vulnCount++
    }
  })
  return vulnCount
}

// Run all tests
console.log('===== ENUM VALIDATION VULNERABILITY TEST =====')
let totalVulns = 0
totalVulns += testAlertsPatchValidation()
totalVulns += testAlertsPostValidation()
totalVulns += testKanbanPostValidation()
totalVulns += testKanbanPutValidation()

console.log('\n===== SUMMARY =====')
console.log(`Total Vulnerabilities Found: ${totalVulns}`)
console.log('\n✗ FINDING: Multiple API endpoints accept invalid enum values')
console.log('✗ Location 1: dashboard/app/api/alerts/route.ts')
console.log('   - PATCH (line 74): accepts any status (NOT validated against "active" | "resolved")')
console.log('   - POST (line 58): accepts any level (NOT validated against "info" | "warning" | "critical")')
console.log('✗ Location 2: dashboard/app/api/kanban/route.ts')
console.log('   - POST (line 54): accepts any status (NOT validated against "todo" | "in-progress" | "done")')
console.log('   - PUT (line 85): completely open via Object.assign, allows any malformed status')
console.log('\n✓ IMPACT: Invalid states propagate through system, breaking client logic and data integrity')
console.log('✓ RECOMMENDATION: Add enum validation using Zod or manual checks before processing')
