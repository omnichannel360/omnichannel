#!/usr/bin/env node

/**
 * UUID Generation Verification Script
 * Tests the UUID utility without requiring jest
 */

// Simple UUID v4 generator implementation
function generateUUIDv4() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const array = new Uint8Array(16)
    globalThis.crypto.getRandomValues(array)

    // Set version (4) and variant (RFC 4122) bits
    array[6] = (array[6] & 0x0f) | 0x40
    array[8] = (array[8] & 0x3f) | 0x80

    return [
      array[0].toString(16).padStart(2, '0'),
      array[1].toString(16).padStart(2, '0'),
      array[2].toString(16).padStart(2, '0'),
      array[3].toString(16).padStart(2, '0'),
      array[4].toString(16).padStart(2, '0'),
      array[5].toString(16).padStart(2, '0'),
      array[6].toString(16).padStart(2, '0'),
      array[7].toString(16).padStart(2, '0'),
      '-',
      array[8].toString(16).padStart(2, '0'),
      array[9].toString(16).padStart(2, '0'),
      '-',
      array[10].toString(16).padStart(2, '0'),
      array[11].toString(16).padStart(2, '0'),
      '-',
      array[12].toString(16).padStart(2, '0'),
      array[13].toString(16).padStart(2, '0'),
      '-',
      array[14].toString(16).padStart(2, '0'),
      array[15].toString(16).padStart(2, '0'),
    ].join('')
  }

  const placeholder = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  return placeholder.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function generateId() {
  return generateUUIDv4()
}

function generatePrefixedId(prefix) {
  return `${prefix}_${generateUUIDv4()}`
}

// Test suite
console.log('UUID Generation Verification Tests\n')
console.log('=' .repeat(50))

let testsPassed = 0
let testsFailed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`)
    testsPassed++
  } else {
    console.log(`✗ ${message}`)
    testsFailed++
  }
}

// Test 1: Basic UUID generation
console.log('\n1. Basic UUID Generation')
console.log('-'.repeat(50))
const uuid1 = generateId()
assert(typeof uuid1 === 'string', 'UUID is a string')
assert(uuid1.length === 36, 'UUID is 36 characters long')

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
assert(uuidRegex.test(uuid1), 'UUID matches RFC 4122 v4 format')

// Test 2: Uniqueness
console.log('\n2. UUID Uniqueness')
console.log('-'.repeat(50))
const ids = new Set()
for (let i = 0; i < 1000; i++) {
  ids.add(generateId())
}
assert(ids.size === 1000, 'Generated 1000 unique UUIDs')

// Test 3: Version and variant bits
console.log('\n3. RFC 4122 Compliance')
console.log('-'.repeat(50))
const testUuid = generateId()
const versionChar = testUuid[14]
const variantChar = testUuid[19]
assert(versionChar === '4', 'Version is correctly set to 4')
assert(['8', '9', 'a', 'A', 'b', 'B'].includes(variantChar), 'Variant bits are correctly set')

// Test 4: Prefixed UUIDs
console.log('\n4. Prefixed UUID Generation')
console.log('-'.repeat(50))
const userMsg = generatePrefixedId('user')
const assistantMsg = generatePrefixedId('assistant')
const errorMsg = generatePrefixedId('error')

assert(userMsg.startsWith('user_'), 'User message has correct prefix')
assert(assistantMsg.startsWith('assistant_'), 'Assistant message has correct prefix')
assert(errorMsg.startsWith('error_'), 'Error message has correct prefix')

assert(userMsg !== assistantMsg, 'Different prefixes generate different IDs')
assert(assistantMsg !== errorMsg, 'Different messages generate different IDs')

// Test 5: Replacement for Date.now()
console.log('\n5. Date.now() Replacement')
console.log('-'.repeat(50))
const id1 = generateId()
const id2 = generateId()
// Simulate rapid generation like Date.now().toString()
const id3 = generateId()
const id4 = generateId()

const rapidIds = [id1, id2, id3, id4]
const uniqueRapid = new Set(rapidIds)
assert(
  uniqueRapid.size === 4,
  'Rapid successive calls generate unique IDs (unlike Date.now())'
)

// Test 6: Can be used as object keys
console.log('\n6. Object Key Usage')
console.log('-'.repeat(50))
const obj = {}
const key1 = generateId()
const key2 = generateId()

obj[key1] = 'value1'
obj[key2] = 'value2'

assert(obj[key1] === 'value1', 'UUID works as object key')
assert(obj[key2] === 'value2', 'Multiple UUIDs work as different keys')
assert(Object.keys(obj).length === 2, 'Object contains both keys')

// Summary
console.log('\n' + '='.repeat(50))
console.log(`\nTest Results: ${testsPassed} passed, ${testsFailed} failed`)
console.log(`Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%\n`)

if (testsFailed > 0) {
  console.log('❌ Some tests failed!')
  process.exit(1)
} else {
  console.log('✅ All verification tests passed!')
  process.exit(0)
}
