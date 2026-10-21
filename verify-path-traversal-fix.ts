/**
 * Quick Verification Script - Path Traversal Defenses
 * Run this to verify the fix is working correctly
 */

import { MeetingTypeSchema, SkillTypeSchema, safeJoin } from '@/lib/validation'
import path from 'path'

console.log('=== PATH TRAVERSAL FIX VERIFICATION ===\n')

// Test 1: Schema validation
console.log('TEST 1: MeetingTypeSchema Validation')
const tests = [
  { input: 'planning', expected: true, label: 'Valid type' },
  { input: '../../../etc/passwd', expected: false, label: 'Path traversal' },
  { input: '/etc/passwd', expected: false, label: 'Absolute path' },
  { input: 'planning\0test', expected: false, label: 'Null byte' },
  { input: 'planning|cat', expected: false, label: 'Pipe character' },
  { input: '$HOME/data', expected: false, label: 'Variable expansion' },
]

let passed = 0
tests.forEach(({ input, expected, label }) => {
  const result = MeetingTypeSchema.safeParse(input)
  const success = result.success === expected
  passed += success ? 1 : 0
  console.log(`  ${success ? '✓' : '✗'} ${label}: "${input}" → ${result.success}`)
})
console.log(`  Result: ${passed}/${tests.length} passed\n`)

// Test 2: basename() defense
console.log('TEST 2: path.basename() Defense')
const basenameTests = [
  { input: '../../../etc/passwd', changes: true, label: 'Strips directory traversal' },
  { input: 'planning_meeting.json', changes: false, label: 'Preserves safe filename' },
  { input: '/etc/passwd', changes: true, label: 'Strips absolute path' },
]

let basenamePass = 0
basenameTests.forEach(({ input, changes, label }) => {
  const result = path.basename(input)
  const changed = result !== input
  const success = changed === changes
  basenamePass += success ? 1 : 0
  console.log(`  ${success ? '✓' : '✗'} ${label}`)
  console.log(`    Input: ${input}`)
  console.log(`    Output: ${result}`)
})
console.log(`  Result: ${basenamePass}/${basenameTests.length} passed\n`)

// Test 3: safeJoin defense
console.log('TEST 3: safeJoin() Containment Defense')
const safeJoinTests = [
  { base: '/safe/dir', file: 'meeting.json', shouldPass: true, label: 'Safe filename' },
  { base: '/safe/dir', file: '../../../etc/passwd', shouldPass: false, label: 'Path traversal blocked' },
  { base: '/safe/dir', file: '/etc/passwd', shouldPass: false, label: 'Absolute path blocked' },
]

let safeJoinPass = 0
safeJoinTests.forEach(({ base, file, shouldPass, label }) => {
  try {
    const result = safeJoin(base, file)
    const success = shouldPass
    safeJoinPass += success ? 1 : 0
    console.log(`  ${success ? '✓' : '✗'} ${label}: Created path successfully`)
  } catch (e) {
    const success = !shouldPass
    safeJoinPass += success ? 1 : 0
    console.log(`  ${success ? '✓' : '✗'} ${label}: Correctly blocked`)
  }
})
console.log(`  Result: ${safeJoinPass}/${safeJoinTests.length} passed\n`)

// Summary
const totalPass = passed + basenamePass + safeJoinPass
const totalTests = tests.length + basenameTests.length + safeJoinTests.length
const allPassed = totalPass === totalTests

console.log(`=== VERIFICATION SUMMARY ===`)
console.log(`Total Tests: ${totalTests}`)
console.log(`Passed: ${totalPass}`)
console.log(`Failed: ${totalTests - totalPass}`)
console.log(`Status: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`)
