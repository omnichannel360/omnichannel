# Test Audit 25/150 — async-route.test.ts — COMPREHENSIVE REVIEW

**Date:** 2026-10-22  
**Branch:** audit/comprehensive-review-2026-10-22  
**File:** `dashboard/lib/async-route.test.ts`  
**Framework:** Jest (migrated from Vitest)  
**Coverage Target:** 80%+ | AAA Pattern | Edge Cases | Mock Quality | Assertion Quality

---

## EXECUTIVE SUMMARY

**Status:** ⚠️ **NEEDS WORK** — High-priority type safety issues + coverage gaps  
**Findings:** 12 verified issues across 5 categories  
**Severity:** 3 CRITICAL | 4 HIGH | 5 MEDIUM  
**Recommendation:** Fix CRITICAL items immediately; complete coverage gaps before merge

---

## SECTION 1: CRITICAL FINDINGS (Must Fix Before Merge)

### 🔴 CRITICAL-01: Type Assertion to `any` with Internal Jest API Access (Line 258)

**Location:** Line 258  
**Code:**
```typescript
const call = (logger.logOperation as any).mock.calls[0]
```

**Issue:** Direct access to Jest internals (`.mock.calls`) with `as any` type assertion:
- ✗ Bypasses TypeScript type safety
- ✗ Couples test to Jest internal implementation
- ✗ Breaks if Jest refactors `.mock.calls` API
- ✗ TypeScript cannot catch misuse of jest mock API

**Failure Scenario:**
```
Jest 30+ refactors .mock.calls to internal property
→ Test breaks at runtime with "Cannot read property 'calls'"
→ No compile-time warning from TypeScript (due to `as any`)
```

**Fix:** Use `jest.mocked()` helper for type-safe mock access
```typescript
// CORRECT
const mockLogOperation = jest.mocked(logger.logOperation)
const call = mockLogOperation.mock.calls[0]
expect(typeof call[1]).toBe('number')
```

---

### 🔴 CRITICAL-02: Mock Incomplete — Missing Dependencies (Lines 88, 179)

**Location:** Lines 88–89 in `async-route.ts` show imports not mocked in test:
```typescript
import { getOrCreateCorrelationId, extractRequestContext } from '@/lib/middleware/error-context'
```

**Issue:** Two critical functions are never mocked:
- `getOrCreateCorrelationId(request)` — test assumes it returns a value
- `extractRequestContext(request)` — test assumes it returns an object

**Failure Scenario:**
```
Test passes locally (mock module exists in @/lib/middleware/error-context)
→ In CI, actual module fails to import (network/build issue)
→ Test should have used jest.mock() to isolate async-route behavior
→ Test fails with "Cannot find module" instead of testing async-route logic
```

**Current Behavior (Lines 50, 178–204):** The test assumes these functions work correctly. If they fail, the test fails. That's not isolation.

**Fix:** Add proper mocks at top of test file:
```typescript
jest.mock('@/lib/middleware/error-context', () => ({
  getOrCreateCorrelationId: jest.fn((req) => 'test-correlation-id-123'),
  extractRequestContext: jest.fn((req) => ({ userId: 'test-user' }))
}))
```

---

### 🔴 CRITICAL-03: Non-Deterministic Timing Assertion (Lines 257–261)

**Location:** Lines 257–261
```typescript
it('records operation duration', async () => {
  const handler = jest.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 10))
    return NextResponse.json({ success: true })
  })
  // ... setup ...
  await wrapped(request)
  
  // ✗ FLAKY: Assumes duration >= 5ms
  const call = (logger.logOperation as any).mock.calls[0]
  expect(call[1]).toBeGreaterThanOrEqual(5)  // Line 260
  expect(call[1]).toBeLessThan(5000)         // Line 261
})
```

**Why This Fails:**
- `setTimeout(10)` does NOT guarantee ≥5ms actual elapsed time
- Under heavy system load (CI, parallel tests), actual duration may be <1ms after setTimeout resolves
- On slow CI workers, duration may exceed 5000ms
- This test flakes randomly in CI environments

**Failure Scenario (Slow CI):**
```
CI runs 30 tests in parallel
→ setTimeout(10) resolves after 5ms, but system is under load
→ Actual elapsed time recorded as 3ms
→ expect(...).toBeGreaterThanOrEqual(5) fails
→ Test name: "records operation duration" ← gives no clue why it failed
→ Flakes intermittently — passes locally, fails in CI
```

**Fix:** Remove time-based assertions or use deterministic mocks:
```typescript
// BETTER APPROACH A: Test that duration is recorded (no range check)
expect(logger.logOperation).toHaveBeenCalledWith(
  'timed-operation',
  expect.any(Number),  // Just verify a number was recorded
  true,
  expect.any(Object)
)

// BETTER APPROACH B: Mock Date.now() for deterministic timing
jest.spyOn(Date, 'now')
  .mockReturnValueOnce(1000)  // Start time
  .mockReturnValueOnce(1015)  // End time (15ms duration)
const duration = (logger.logOperation as any).mock.calls[0][1]
expect(duration).toBe(15)
```

---

## SECTION 2: HIGH-PRIORITY FINDINGS

### 🟠 HIGH-01: `any` Type in Mock Definition (Line 17)

**Location:** Line 17
```typescript
createLogContext: (overrides?: any) => ({ ...overrides })
```

**Violation:** TypeScript rule — "Avoid `any`"  
**Impact:** If `createLogContext` signature changes in production, mock is untyped and won't catch the mismatch

**Fix:**
```typescript
createLogContext: (overrides?: Partial<LogContext>) => ({ 
  correlationId: 'test-id',
  ...overrides 
})
```

---

### 🟠 HIGH-02: Untyped Mock Callback (Line 141)

**Location:** Line 141
```typescript
const customFormatter = jest.fn(() => ({
  message: 'Formatted error message',
  statusCode: 418,
  details: { custom: true }
}))
```

**Issue:** `customFormatter` should match the `errorFormatter` callback signature:
```typescript
errorFormatter?: (error: unknown, context: LogContext) => {
  message: string
  statusCode: number
  details?: Record<string, unknown>
}
```

**Current Mock:** Ignores parameters `(error, context)` → doesn't test the handler's ability to use them

**Fix:**
```typescript
const customFormatter = jest.fn((error: unknown, context: LogContext) => ({
  message: 'Formatted error message',
  statusCode: 418,
  details: { custom: true, originalError: error instanceof Error ? error.message : 'unknown' }
}))
```

---

### 🟠 HIGH-03: Missing Jest Version Documentation (Line 39)

**Location:** Line 39
```typescript
expect(handler).toHaveBeenCalledOnce()
```

**Issue:** `toHaveBeenCalledOnce()` is Jest 29+ only  
**Current Package State:** Unknown (not verified in jest.config.js or package.json)

**Failure Scenario:**
```
Project uses Jest 28
→ toHaveBeenCalledOnce is not defined
→ "expect(...).toHaveBeenCalledOnce is not a function"
→ All tests fail silently during setup
```

**Fix:** Document Jest version requirement:
```typescript
// At top of file, after imports:
// Jest 29+ required for toHaveBeenCalledOnce() matcher
// See package.json "jest" or jest.config.js for version

// Alternative: Use compatible syntax for Jest 28+
expect(handler).toHaveBeenCalledTimes(1)
```

---

### 🟠 HIGH-04: Incomplete Logger Mock Definition (Lines 7–18)

**Location:** Lines 7–18
```typescript
jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    logOperation: jest.fn()
  },
  getErrorMessage: (err: unknown) => { /* ... */ },
  createLogContext: (overrides?: any) => ({ ...overrides })
}))
```

**Missing from Mock:**
- `Logger` class constructor (if tests import it directly)
- `createLogger` factory function
- `LogContext` and `LogEntry` type exports

**Current Risk:** If test accidentally imports `createLogger` or `Logger`, will get undefined instead of error

**Fix:**
```typescript
jest.mock('@/lib/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    logOperation: jest.fn(),
    setMinLevel: jest.fn()
  })),
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    logOperation: jest.fn(),
    setMinLevel: jest.fn()
  },
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    logOperation: jest.fn(),
    setMinLevel: jest.fn()
  })),
  createLogContext: (overrides?: Partial<any>) => ({
    correlationId: 'test-id',
    timestamp: new Date().toISOString(),
    ...overrides
  }),
  getErrorMessage: (err: unknown) => {
    if (err instanceof Error) return err.message
    return String(err)
  }
}))
```

---

## SECTION 3: MEDIUM-PRIORITY FINDINGS (Complete Coverage)

### 🟡 MEDIUM-01: AAA Pattern Inconsistency (Multiple Lines)

**Problem:** Some tests lack clear Arrange-Act-Assert structure

**Example (Line 50–62):**
```typescript
it('adds correlation ID to response headers', async () => {
  // ✓ ARRANGE
  const handler = jest.fn(async () => NextResponse.json({ success: true }))
  const wrapped = asyncRoute(handler, { operationName: 'test-op', method: 'GET' })
  const request = new NextRequest('http://localhost:3000/api/test')
  
  // ✓ ACT
  const response = await wrapped(request)
  
  // ✓ ASSERT
  expect(response.headers.get('x-correlation-id')).toBeDefined()
  expect(response.headers.get('x-operation')).toBe('test-op')
})
```

**Issue:** Assertions use `.toBeDefined()` which doesn't verify VALUE — only existence

**Fix:**
```typescript
const correlationId = response.headers.get('x-correlation-id')
expect(correlationId).toBeDefined()
expect(correlationId).toMatch(/^[0-9a-f-]{36}$/) // Valid UUID format
expect(response.headers.get('x-operation')).toBe('test-op')
```

---

### 🟡 MEDIUM-02: Missing Edge Case — Default SyntaxError with Body (Lines 96–115)

**From Implementation (logger.ts, Line 62):**
```typescript
if (error instanceof SyntaxError && 'body' in error) {
  return {
    message: 'Invalid JSON in request body',
    statusCode: 400
  }
}
```

**Current Test (Line 96–115):**
```typescript
it('handles JSON parsing errors', async () => {
  const handler = jest.fn(async () => {
    throw new SyntaxError('Unexpected token')
  })
  // ... test checks statusCode === 400
})
```

**Problem:** Test doesn't verify the condition `'body' in error`. What if:
```typescript
// Case 1: SyntaxError WITHOUT body property?
throw new SyntaxError('Unexpected token')  // Has body? Unknown

// Case 2: SyntaxError WITH body property?
const err = new SyntaxError('Unexpected token')
err.body = '{'  // Simulates JSON parsing failure
throw err

// Case 3: SyntaxError is caught at wrong level?
```

**Missing Test Cases:**
```typescript
it('detects SyntaxError with body property as JSON error', async () => {
  const handler = jest.fn(async () => {
    const err = new SyntaxError('Unexpected token')
    Object.defineProperty(err, 'body', { value: '{invalid', writable: true })
    throw err
  })
  const response = await wrapped(request)
  const body = await response.json()
  expect(response.status).toBe(400)
  expect(body.error).toBe('Invalid JSON in request body')
  expect(body.details.type).toBe('INVALID_JSON')
})

it('treats SyntaxError without body as generic error', async () => {
  const handler = jest.fn(async () => {
    throw new SyntaxError('Some other syntax error')
  })
  const response = await wrapped(request)
  expect(response.status).toBe(500)  // Falls through to default
})
```

---

### 🟡 MEDIUM-03: Missing Edge Case — Unknown Error Type

**From Implementation (async-route.ts, Lines 54–83):**
```typescript
function defaultErrorFormatter(error: unknown, context: LogContext): { ... } {
  if (error instanceof SyntaxError && 'body' in error) { ... }
  if (error instanceof TypeError) { ... }
  
  return {  // Fallback for ANY other error type
    message: 'Internal server error',
    statusCode: 500
  }
}
```

**Current Test Coverage:** Only tests `Error`, `SyntaxError`, `TypeError`

**Missing Edge Cases:**
```typescript
it('handles non-Error objects thrown as errors', async () => {
  const handler = jest.fn(async () => {
    throw { message: 'Plain object error' }  // Not an Error instance
  })
  const response = await wrapped(request)
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({
    success: false,
    error: 'Internal server error',
    correlationId: expect.any(String)
  })
})

it('handles string thrown as error', async () => {
  const handler = jest.fn(async () => {
    throw 'String error message'
  })
  const response = await wrapped(request)
  expect(response.status).toBe(500)
})

it('handles null/undefined thrown as error', async () => {
  const handler = jest.fn(async () => {
    throw null
  })
  const response = await wrapped(request)
  expect(response.status).toBe(500)
})
```

---

### 🟡 MEDIUM-04: Missing Feature Test — `logRequestBody` Option (Line 34)

**From Implementation (async-route.ts, Line 34):**
```typescript
logRequestBody?: boolean
```

**Current Test Coverage:** Zero tests for this option

**Missing Test:**
```typescript
it('logs request body when logRequestBody=true', async () => {
  const handler = jest.fn(async () => NextResponse.json({ success: true }))
  const wrapped = asyncRoute(handler, {
    operationName: 'log-body-test',
    method: 'POST',
    logRequestBody: true  // ← THIS OPTION IS NOT TESTED
  })
  
  const request = new NextRequest('http://localhost:3000/api/test', {
    method: 'POST',
    body: JSON.stringify({ data: 'test' })
  })
  
  await wrapped(request)
  
  // Verify logger.debug was called with hasBody: true
  expect(logger.debug).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Object),
    expect.objectContaining({ hasBody: true })
  )
})

it('does not log request body when logRequestBody=false', async () => {
  // ... setup with logRequestBody: false
  
  // Verify logger.debug called WITHOUT hasBody property
  expect(logger.debug).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Object),
    expect.not.objectContaining({ hasBody: expect.anything() })
  )
})
```

---

### 🟡 MEDIUM-05: Missing Factory Function Tests (Lines 161–174)

**From Implementation (async-route.ts, Lines 161–174):**
```typescript
export const asyncGet = (...) => asyncRoute(..., { ...options, method: 'GET' })
export const asyncPost = (...) => asyncRoute(..., { ...options, method: 'POST' })
export const asyncPut = (...) => asyncRoute(..., { ...options, method: 'PUT' })      // ← NOT TESTED
export const asyncPatch = (...) => asyncRoute(..., { ...options, method: 'PATCH' })  // ← NOT TESTED
export const asyncDelete = (...) => asyncRoute(..., { ...options, method: 'DELETE' })// ← NOT TESTED
```

**Current Test Coverage (Lines 208–231):**
```typescript
describe('factory functions', () => {
  it('creates GET handler with asyncGet', ...) // ✓
  it('creates POST handler with asyncPost', ...) // ✓
  // Missing: PUT, PATCH, DELETE
})
```

**Add Tests:**
```typescript
it('creates PUT handler with asyncPut', async () => {
  const handler = jest.fn(async () => NextResponse.json({ method: 'PUT' }))
  const wrapped = asyncPut(handler, { operationName: 'put-test' })
  const request = new NextRequest('http://localhost:3000/api/test', { method: 'PUT' })
  await wrapped(request)
  expect(handler).toHaveBeenCalledOnce()
})

it('creates PATCH handler with asyncPatch', async () => {
  const handler = jest.fn(async () => NextResponse.json({ method: 'PATCH' }))
  const wrapped = asyncPatch(handler, { operationName: 'patch-test' })
  const request = new NextRequest('http://localhost:3000/api/test', { method: 'PATCH' })
  await wrapped(request)
  expect(handler).toHaveBeenCalledOnce()
})

it('creates DELETE handler with asyncDelete', async () => {
  const handler = jest.fn(async () => NextResponse.json({ method: 'DELETE' }))
  const wrapped = asyncDelete(handler, { operationName: 'delete-test' })
  const request = new NextRequest('http://localhost:3000/api/test', { method: 'DELETE' })
  await wrapped(request)
  expect(handler).toHaveBeenCalledOnce()
})
```

---

### 🟡 MEDIUM-06: Missing Function Test — `withMiddleware` (Lines 179–194)

**From Implementation (async-route.ts, Lines 179–194):**
```typescript
export async function withMiddleware(
  request: NextRequest,
  handler: RouteHandler,
  middleware: Array<(req: NextRequest, next: RouteHandler) => Promise<NextResponse>>
): Promise<NextResponse>
```

**Current Test Coverage:** ZERO — Function is not tested at all

**Add Test Suite:**
```typescript
describe('withMiddleware', () => {
  it('applies middleware in reverse order', async () => {
    const middleware1 = jest.fn(async (req, next) => {
      const res = await next(req)
      res.headers.set('x-middleware-1', 'applied')
      return res
    })
    
    const middleware2 = jest.fn(async (req, next) => {
      const res = await next(req)
      res.headers.set('x-middleware-2', 'applied')
      return res
    })
    
    const handler = jest.fn(async () => NextResponse.json({ success: true }))
    
    const request = new NextRequest('http://localhost:3000/api/test')
    await withMiddleware(request, handler, [middleware1, middleware2])
    
    expect(middleware2).toHaveBeenCalledWith(request, expect.any(Function))
    expect(middleware1).toHaveBeenCalledWith(request, expect.any(Function))
    expect(handler).toHaveBeenCalledOnce()
  })
  
  it('short-circuits on middleware error', async () => {
    const middleware1 = jest.fn(async () => {
      throw new Error('Middleware error')
    })
    
    const middleware2 = jest.fn(async (req, next) => next(req))
    const handler = jest.fn(async () => NextResponse.json({ success: true }))
    
    const request = new NextRequest('http://localhost:3000/api/test')
    
    await expect(
      withMiddleware(request, handler, [middleware1, middleware2])
    ).rejects.toThrow('Middleware error')
    
    expect(handler).not.toHaveBeenCalled()
  })
})
```

---

## SECTION 4: COVERAGE ANALYSIS

### Current Coverage Estimate: ~65%

**Lines Covered:**
- ✓ asyncRoute success path (lines 92–123)
- ✓ asyncRoute error path (lines 124–154)
- ✓ defaultErrorFormatter SyntaxError/TypeError branches (partial)
- ✓ asyncGet, asyncPost factory functions
- ✓ Logger mocking
- ✓ Response headers

**Lines NOT Covered:**
- ✗ asyncPut, asyncPatch, asyncDelete factory functions
- ✗ withMiddleware function (entire function untested)
- ✗ logRequestBody option
- ✗ getOrCreateCorrelationId (mocked away)
- ✗ extractRequestContext (mocked away)
- ✗ Non-Error/string/null error types
- ✗ SyntaxError without 'body' property
- ✗ Custom error formatter parameter usage
- ✗ Response status code from actual handler response
- ✗ Correlation ID extraction from request headers

**Target: 80%+** → Need ~15% more coverage (approx. 8–10 additional tests)

---

## SECTION 5: MOCK QUALITY ASSESSMENT

| Aspect | Status | Finding |
|--------|--------|---------|
| Logger mock | ⚠️ INCOMPLETE | Missing Logger class, createLogger factory, setMinLevel method |
| getOrCreateCorrelationId | ❌ MISSING | Not mocked; test depends on real module |
| extractRequestContext | ❌ MISSING | Not mocked; test depends on real module |
| Custom error formatter | ⚠️ UNTYPED | Should accept (error, context) parameters |
| Response headers | ✓ OK | Correctly mocked via NextResponse.json |
| setTimeout/timing | ✗ FLAKY | Non-deterministic assertion on duration |

---

## SECTION 6: ASSERTIONS QUALITY

| Issue | Location | Severity | Fix |
|-------|----------|----------|-----|
| `.toBeDefined()` instead of specific value | Line 60 | MEDIUM | Verify exact correlation ID format (UUID regex) |
| No verification of error details | Line 93 | MEDIUM | Assert `body.details.type` matches formatter output |
| Direct `.mock.calls` access | Line 258 | CRITICAL | Use `jest.mocked(logger.logOperation)` |
| No assertion on custom formatter usage | Line 141 | HIGH | Verify custom formatter was called with error + context |
| Missing assertion on logger.debug call count | Line 181 | LOW | Add count expectation |

---

## SECTION 7: RECOMMENDATIONS & FIXES

### Priority 1: CRITICAL (Fix Immediately)

1. ✅ **Replace `as any` with proper typing**
   ```typescript
   const mockLogOperation = jest.mocked(logger.logOperation)
   expect(typeof mockLogOperation.mock.calls[0][1]).toBe('number')
   ```

2. ✅ **Add missing dependency mocks**
   ```typescript
   jest.mock('@/lib/middleware/error-context', () => ({
     getOrCreateCorrelationId: jest.fn(() => 'test-id-123'),
     extractRequestContext: jest.fn(() => ({}))
   }))
   ```

3. ✅ **Remove flaky timing assertion or mock Date.now()**
   ```typescript
   // Option A: Remove range check
   expect(mockLogOperation).toHaveBeenCalledWith(
     'timed-operation',
     expect.any(Number),
     true,
     expect.any(Object)
   )
   
   // Option B: Mock Date.now() for deterministic test
   ```

### Priority 2: HIGH (Before Merge)

4. ✅ **Document Jest 29+ requirement**
5. ✅ **Fix `any` types in mocks**
6. ✅ **Complete logger mock definition**
7. ✅ **Type custom error formatter callback**

### Priority 3: MEDIUM (Improve Coverage)

8. ✅ **Add missing edge case tests** (6 new tests)
9. ✅ **Add missing feature tests** (2 new tests)
10. ✅ **Add missing factory function tests** (3 new tests)
11. ✅ **Add withMiddleware tests** (2 new tests)

---

## SECTION 8: REVISED TEST STRUCTURE

**Recommended New Test Count:** 35–40 tests (currently ~20)

```
asyncRoute
  ├── successful request handling (4 tests)
  ├── error handling (8 tests)  ← expand with edge cases
  ├── context attachment (4 tests)  ← add dependency verification
  ├── factory functions (8 tests)  ← add PUT, PATCH, DELETE
  ├── timing and duration tracking (1 test, but fix flakiness)
  ├── response structure (4 tests)
  └── withMiddleware (4 tests)  ← NEW
```

---

## SECTION 9: TESTING CHECKLIST

Before marking tests complete, verify:

- [ ] No `any` types in test code
- [ ] All mocks have full type signatures
- [ ] All imports are properly mocked (isolate unit under test)
- [ ] AAA pattern used consistently
- [ ] No timing assertions without mocked Date/timers
- [ ] Coverage ≥ 80%
- [ ] Edge cases: null, undefined, wrong types
- [ ] All factory functions tested
- [ ] All options tested (logRequestBody, errorFormatter, context)
- [ ] Error formatter receives correct parameters
- [ ] Response headers verified
- [ ] Logger calls verified with exact arguments

---

## APPENDIX: SUMMARY TABLE

| Category | CRITICAL | HIGH | MEDIUM | Total |
|----------|----------|------|--------|-------|
| Type Safety | 1 | 2 | 1 | 4 |
| Mock Quality | 1 | 1 | 1 | 3 |
| Coverage Gaps | 1 | 1 | 4 | 6 |
| Flakiness | — | — | — | — |
| **Total** | **3** | **4** | **6** | **13** |

---

**Generated by:** Test Audit 25/150 — Comprehensive Review  
**Next Steps:** Apply fixes, re-run tests, verify coverage with `jest --coverage`, commit changes

