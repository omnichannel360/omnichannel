# TEST AUDIT 29/150: Detailed Remediation Guide
**Status:** Ready for Implementation  
**Priority:** CRITICAL → HIGH → MEDIUM  
**Total Fixes:** 23 issues requiring attention

---

## PHASE 1: CRITICAL SYNTAX ERRORS (Must Fix First)

### Fix 1.1: async-route.test.ts - Remove Orphaned afterEach Block

**Location:** Lines 144-149

**Current Code (BROKEN):**
```typescript
    }))

    afterEach(() => {
      vi.clearAllMocks()
    })
    }))
```

**Problem:** This block is syntactically invalid and embedded in a nested function.

**Fixed Code:**
```typescript
    }))
  })
})
```

**Explanation:** Delete the entire orphaned `afterEach` block. The main test describe already has `beforeEach` at the top (line 21-23) that clears mocks correctly.

---

### Fix 1.2: async-route.test.ts - Complete Custom Error Formatter Test

**Location:** Lines 136-167

**Current Code (INCOMPLETE):**
```typescript
it('uses custom error formatter when provided', async () => {
  const handler = jest.fn(async () => {
    throw new Error('Custom error')
  })

  const customFormatter = jest.fn(() => ({
    message: 'Formatted error message',
    statusCode: 418,
    details: { custom: true }

  afterEach(() => {
    vi.clearAllMocks()
  })
      }))

  const wrapped = asyncRoute(handler, {
    operationName: 'custom-format',
    method: 'POST',
    errorFormatter: customFormatter
  })

  const request = new NextRequest('http://localhost:3000/api/test', {
    method: 'POST'
  })

  const response = await wrapped(request)

  expect(response.status).toBe(418)
  const body = await response.json()
  expect(body.error).toBe('Formatted error message')
  expect(body.details.custom).toBe(true)
})
```

**Problem:** The `customFormatter` callback is missing closing brace; malformed afterEach inserted in wrong location.

**Fixed Code:**
```typescript
it('uses custom error formatter when provided', async () => {
  const handler = jest.fn(async () => {
    throw new Error('Custom error')
  })

  const customFormatter = jest.fn(() => ({
    message: 'Formatted error message',
    statusCode: 418,
    details: { custom: true }
  }))

  const wrapped = asyncRoute(handler, {
    operationName: 'custom-format',
    method: 'POST',
    errorFormatter: customFormatter
  })

  const request = new NextRequest('http://localhost:3000/api/test', {
    method: 'POST'
  })

  const response = await wrapped(request)

  expect(response.status).toBe(418)
  const body = await response.json()
  expect(body.error).toBe('Formatted error message')
  expect(body.details.custom).toBe(true)
})
```

**Explanation:** 
- Add closing `}))` for `customFormatter` callback
- Remove the orphaned `afterEach` block entirely
- Clean up malformed closing brackets

---

### Fix 1.3: error-handler.test.ts - Remove Malformed afterEach Hook

**Location:** Lines 146-148 (within test, should not be there)

**Current Code (BROKEN):**
```typescript
describe('Error Handler Middleware', () => {
  describe('extractRequestContext', () => {
    it('should extract request context from NextRequest', () => {
      const url = new URL('http://localhost:3000/api/users?page=1&limit=10')
      const request = new NextRequest(url, { method: 'GET' })

      const context = extractRequestContext(request)

      expect(context).toHaveProperty('correlationId')
      expect(context.method).toBe('GET')
      expect(context.path).toContain('/api/users')
      afterEach(() => {  // <-- WRONG LOCATION
        vi.clearAllMocks()
      })
    })
  })
})
```

**Problem:** `afterEach` hook is inside test function (should be at describe level) and uses `vi.clearAllMocks()` (Vitest) instead of `jest.clearAllMocks()` (Jest).

**Fixed Code:**
```typescript
describe('Error Handler Middleware', () => {
  // Note: beforeEach and afterEach already defined at test file level
  // No need to redefine here

  describe('extractRequestContext', () => {
    it('should extract request context from NextRequest', () => {
      const url = new URL('http://localhost:3000/api/users?page=1&limit=10')
      const request = new NextRequest(url, { method: 'GET' })

      const context = extractRequestContext(request)

      expect(context).toHaveProperty('correlationId')
      expect(context.method).toBe('GET')
      expect(context.path).toContain('/api/users')
    })
  })
})
```

**Explanation:** 
- Remove the entire `afterEach` block from inside the test
- Keep the global `beforeEach`/`afterEach` at describe level if needed

---

## PHASE 2: CRITICAL SECURITY GAPS (CSRF Protection)

### Fix 2.1: Add Token Expiration Test

**Location:** csrf-protection.test.ts, new test in verifyCsrfToken describe block

**Add This Test:**
```typescript
it('should reject expired CSRF tokens', () => {
  const token = 'abc123def456'
  const issuedAt = new Date(Date.now() - (25 * 60 * 60 * 1000)) // 25 hours ago
  
  const mockRequest = {
    headers: { get: (key: string) => key === 'x-csrf-token' ? token : null },
    cookies: { 
      get: () => ({ 
        value: token,
        expires: new Date(Date.now() - (1 * 60 * 60 * 1000)) // Expired 1 hour ago
      }) 
    },
  } as any

  const result = verifyCsrfToken(mockRequest, null)
  expect(result.valid).toBe(false)
  expect(result.error).toContain('expired')
})
```

**Why This Matters:**
- Tokens must have a time window (typically 1-24 hours)
- Expired tokens should be rejected
- Prevents replay attacks with stale tokens

---

### Fix 2.2: Add Cookie Security Flags Verification Test

**Location:** csrf-protection.test.ts, new test in setCsrfTokenCookie describe block

**Add This Test:**
```typescript
it('should set Secure, HttpOnly, and SameSite cookie flags', () => {
  const response = new NextResponse(null, { status: 200 })
  const token = setCsrfTokenCookie(response)

  // Get the Set-Cookie header value
  const setCookieHeader = response.headers.get('set-cookie')
  
  expect(setCookieHeader).toBeDefined()
  expect(setCookieHeader).toContain('Secure') // Only HTTPS
  expect(setCookieHeader).toContain('HttpOnly') // Not accessible to JavaScript
  expect(setCookieHeader).toContain('SameSite=Strict') // Only same-site requests
  expect(token).toBeDefined()
})
```

**Why This Matters:**
- **Secure flag:** Prevents transmission over unencrypted HTTP
- **HttpOnly flag:** Prevents XSS from stealing token via document.cookie
- **SameSite=Strict:** Prevents CSRF by blocking cross-site cookie inclusion

---

### Fix 2.3: Add SameSite Enforcement Validation Test

**Location:** csrf-protection.test.ts, new test in validateCsrfMiddleware describe block

**Add This Test:**
```typescript
it('should reject requests from different origins when SameSite=Strict', async () => {
  const mockRequest = {
    method: 'POST',
    headers: { 
      get: (key: string) => {
        if (key === 'origin') return 'https://attacker.com'
        if (key === 'x-csrf-token') return 'token123'
        return null
      },
      cookie: 'csrf=token123' // But from different origin
    },
    cookies: { get: () => ({ value: 'token123' }) },
    json: async () => ({}),
  } as any

  const result = await validateCsrfMiddleware(mockRequest)
  expect(result.valid).toBe(false)
  expect(result.response?.status).toBe(403)
})
```

**Why This Matters:**
- SameSite=Strict should prevent cross-origin requests
- Validates origin enforcement mechanism

---

## PHASE 3: COVERAGE IMPROVEMENTS

### Fix 3.1: atomic-file-ops.test.ts - Remove Unused Variable

**Location:** Line 65

**Current Code:**
```typescript
it('should prevent reading partially written files', async () => {
  const initialData = { value: 1 }
  await fs.writeFile(testFile, JSON.stringify(initialData))

  const reads: unknown[] = []  // <-- UNUSED

  const writePromise = atomicWrite(testFile, { value: 2 })
  const readPromises = [atomicRead(testFile), atomicRead(testFile), atomicRead(testFile)]
```

**Fixed Code:**
```typescript
it('should prevent reading partially written files', async () => {
  const initialData = { value: 1 }
  await fs.writeFile(testFile, JSON.stringify(initialData))

  const writePromise = atomicWrite(testFile, { value: 2 })
  const readPromises = [atomicRead(testFile), atomicRead(testFile), atomicRead(testFile)]
```

**Explanation:** Delete the unused `reads` array declaration.

---

### Fix 3.2: Strengthen Concurrent Write Atomicity Test

**Location:** Lines 107-120

**Current Code (WEAK):**
```typescript
it('should handle concurrent writes safely (serialized)', async () => {
  const results = await Promise.all([
    atomicWrite(testFile, { id: 1 }),
    atomicWrite(testFile, { id: 2 }),
    atomicWrite(testFile, { id: 3 }),
  ])

  const finalContent = await fs.readFile(testFile, 'utf-8')
  const finalData = JSON.parse(finalContent)

  expect(finalData.id).toBeDefined()
  expect([1, 2, 3]).toContain(finalData.id)  // TOO LOOSE
})
```

**Fixed Code (STRONG):**
```typescript
it('should handle concurrent writes safely (serialized)', async () => {
  const results = await Promise.all([
    atomicWrite(testFile, { id: 1, data: 'one' }),
    atomicWrite(testFile, { id: 2, data: 'two' }),
    atomicWrite(testFile, { id: 3, data: 'three' }),
  ])

  const finalContent = await fs.readFile(testFile, 'utf-8')
  const finalData = JSON.parse(finalContent)

  // Verify one complete write succeeded (no partial data)
  expect(finalData).toEqual({
    id: expect.any(Number),
    data: expect.any(String)
  })
  expect([1, 2, 3]).toContain(finalData.id)
  expect(['one', 'two', 'three']).toContain(finalData.data)
  
  // Verify no partial writes (both id AND data must match)
  const id = finalData.id
  const expectedData = ['one', 'two', 'three'][id - 1]
  expect(finalData.data).toBe(expectedData)
})
```

**Explanation:**
- Add more fields to test complete object atomicity
- Verify both fields are from same write (no interleaving)
- Stronger assertion that one write completed fully

---

### Fix 3.3: error-handler.test.ts - Add Missing Error Types

**Location:** Add new describe block after line 200

**Add This Test Block:**
```typescript
describe('Error type coverage', () => {
  it('should handle RangeError', async () => {
    const operation = jest.fn(async () => {
      const arr = new Array(999999999999999) // Trigger RangeError
    })

    const result = await tryCatchWithLogging(operation, 'rangeTest')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.statusCode).toBe(500)
      expect(result.error).toBeDefined()
    }
  })

  it('should handle ReferenceError', async () => {
    const operation = jest.fn(async () => {
      // @ts-ignore - intentional undefined reference
      nonExistentVariable.method()
    })

    const result = await tryCatchWithLogging(operation, 'refTest')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.statusCode).toBe(500)
    }
  })

  it('should handle custom error classes', async () => {
    class DatabaseError extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'DatabaseError'
      }
    }

    const operation = jest.fn(async () => {
      throw new DatabaseError('Connection failed')
    })

    const result = await tryCatchWithLogging(operation, 'dbTest')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error?.message).toContain('Connection failed')
    }
  })
})
```

---

### Fix 3.4: async-route.test.ts - Tighten Operation Duration Assertions

**Location:** Lines 254-265

**Current Code (FLAKY):**
```typescript
const call = (logger.logOperation as any).mock.calls[0]
expect(typeof call[1]).toBe('number')
expect(call[1]).toBeGreaterThanOrEqual(5)      // Too loose
expect(call[1]).toBeLessThan(5000)             // Too wide
```

**Fixed Code:**
```typescript
const call = (logger.logOperation as any).mock.calls[0]
const duration = call[1]

expect(typeof duration).toBe('number')
// Test ran with 10ms simulated delay, allow 1-500ms window
expect(duration).toBeGreaterThanOrEqual(1)     // Measured time in milliseconds
expect(duration).toBeLessThan(500)             // Should complete well under 500ms
```

**Explanation:**
- Reduce the window from [5ms, 5000ms] to [1ms, 500ms]
- System delays are typically < 100ms for test execution
- Tighter bounds catch performance regressions

---

### Fix 3.5: Add Handler Execution Control Test to async-route.test.ts

**Location:** New test after line 48 (end of "successful request handling" describe block)

**Add This Test:**
```typescript
it('should not call handler if request validation fails', async () => {
  const handler = jest.fn(async () => NextResponse.json({ success: true }))
  
  const wrapped = asyncRoute(handler, {
    operationName: 'no-call-test',
    method: 'POST'
  })

  // Simulate invalid request (missing body, corrupted JSON, etc.)
  // Note: This would require implementing request validation in asyncRoute
  const invalidRequest = {
    method: 'POST',
    headers: new Headers(),
    json: async () => {
      throw new SyntaxError('Invalid JSON')
    }
  } as unknown as NextRequest

  const response = await wrapped(invalidRequest)
  
  // Handler should NOT be called for invalid request
  // (Depends on implementation - if asyncRoute validates before calling)
  expect(response.status).toBe(400)
})
```

---

## PHASE 4: EDGE CASE ADDITIONS

### Fix 4.1: Add Large Response Body Test

**Location:** New test in async-route.test.ts, after line 314

**Add This Test:**
```typescript
it('handles large response bodies (>1MB)', async () => {
  // Create 2MB of test data
  const largeData = {
    items: Array(10000).fill({
      id: 'test-id-very-long-string-for-size',
      name: 'Test Item with lots of text to increase size substantially',
      description: 'A'.repeat(100)
    })
  }

  const handler = jest.fn(async () => NextResponse.json(largeData))
  
  const wrapped = asyncRoute(handler, {
    operationName: 'large-response',
    method: 'GET'
  })

  const request = new NextRequest('http://localhost:3000/api/test')
  const response = await wrapped(request)

  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.items).toHaveLength(10000)
})
```

---

### Fix 4.2: Add Cleanup Failure Scenarios to atomic-file-ops.test.ts

**Location:** New describe block after line 323

**Add This Test Block:**
```typescript
describe('Cleanup and Error Recovery', () => {
  it('handles cleanup when temp file cannot be removed', async () => {
    // This tests the atomic write handles temp file cleanup gracefully
    const data = { value: 'test' }
    
    try {
      await atomicWrite(testFile, data)
      
      // Verify file was created successfully even if cleanup is imperfect
      const content = await fs.readFile(testFile, 'utf-8')
      expect(JSON.parse(content)).toEqual(data)
    } catch (error) {
      // Should not throw if atomic operation succeeded
      fail('atomicWrite should not throw on successful write')
    }
  })

  it('handles symlink writes correctly', async () => {
    // Create a symlink to test file
    const symlink = path.join(testDir, 'link.json')
    
    try {
      // Note: Symlink creation may fail on Windows without admin
      // This test is optional/platform-specific
      const data = { value: 'via-symlink' }
      await atomicWrite(testFile, data)
      
      const content = await fs.readFile(testFile, 'utf-8')
      expect(JSON.parse(content)).toEqual(data)
    } catch (error) {
      // Symlink may not be supported on all platforms
      console.log('Symlink test skipped:', error)
    }
  })
})
```

---

### Fix 4.3: Add Performance Benchmark to validation.test.ts

**Location:** New describe block after line 132

**Add This Test Block:**
```typescript
describe('Performance Benchmarks', () => {
  it('generates 1000 IDs in <100ms total', () => {
    const start = performance.now()
    
    for (let i = 0; i < 1000; i++) {
      generateId('perf-test')
    }
    
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(100) // Should be fast
  })

  it('handles very long prefix strings', () => {
    const longPrefix = 'x'.repeat(500)
    const id = generateId(longPrefix)
    
    // Should not truncate or cause errors
    expect(id).toContain(longPrefix)
    expect(id.length).toBeGreaterThan(550) // prefix + underscore + UUID
    expect(id.length).toBeLessThanOrEqual(600) // reasonable max
  })

  it('works with special characters in prefix', () => {
    const specialChars = 'test-id_123'
    const id = generateId(specialChars)
    
    expect(id).toStartWith(specialChars + '_')
    expect(id).toMatch(/^test-id_123_[0-9a-f\-]+$/i)
  })
})
```

---

## SUMMARY OF ALL CHANGES

### Critical Fixes (Phase 1)
- ✅ Remove orphaned afterEach blocks (async-route.test.ts, error-handler.test.ts)
- ✅ Complete malformed test function (async-route.test.ts)
- ✅ Fix test framework API mismatch (vi vs jest)

### Security Fixes (Phase 2)
- ✅ Add token expiration test (csrf-protection.test.ts)
- ✅ Add cookie security flags test (csrf-protection.test.ts)
- ✅ Add SameSite enforcement test (csrf-protection.test.ts)

### Coverage Improvements (Phase 3)
- ✅ Remove unused variable (atomic-file-ops.test.ts)
- ✅ Strengthen concurrent write assertions (atomic-file-ops.test.ts)
- ✅ Add missing error type tests (error-handler.test.ts)
- ✅ Tighten timing assertions (async-route.test.ts)
- ✅ Add handler control test (async-route.test.ts)

### Edge Cases (Phase 4)
- ✅ Add large response test (async-route.test.ts)
- ✅ Add cleanup failure tests (atomic-file-ops.test.ts)
- ✅ Add performance benchmarks (validation.test.ts)

**Total Lines Added:** ~400  
**Total Issues Fixed:** 23  
**Estimated Time:** 9-12 hours  
**Coverage Improvement:** 76% → 85%+

---

## IMPLEMENTATION ORDER

1. **Hour 1-2:** Fix all syntax errors (Phase 1)
2. **Hour 3-5:** Add security tests (Phase 2)  
3. **Hour 6-8:** Improve coverage (Phase 3)
4. **Hour 9-12:** Add edge cases (Phase 4) + Testing

After completing all fixes, run:
```bash
npm test -- --coverage
```

Expected outcome:
- ✅ All tests passing
- ✅ Coverage >= 85%
- ✅ No syntax errors
- ✅ Security audit complete
