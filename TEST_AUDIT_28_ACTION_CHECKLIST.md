# Test Audit 28 - Action Checklist

## Quick Reference

**Date:** 2026-10-22  
**Total Issues:** 22  
**Critical Issues:** 4  
**High Issues:** 5  
**Medium Issues:** 10  
**Low Issues:** 3  

**Current Quality:** 84/100  
**Target Quality:** 92/100  
**Tests to Add:** 24  
**Estimated Hours:** 7-8  

---

## PHASE 1: CRITICAL FIXES (3.5 hours)

### Priority 1.1: CSRF Security - Timing-Safe Comparison
- [ ] **Test:** Verify `crypto.timingSafeEqual` with matching tokens
- [ ] **Test:** Verify `crypto.timingSafeEqual` with mismatched tokens
- [ ] **File:** csrf-protection.test.ts
- [ ] **Lines:** Add before line 71 (after setCsrfTokenCookie tests)
- [ ] **Effort:** 30 min
- [ ] **Verification:** Test passes, timing safety property holds

### Priority 1.2: CSRF - Body Token Parsing
- [ ] **Test:** Accept token from request body (_csrf field)
- [ ] **Test:** Accept token from request body (csrfToken field)
- [ ] **Test:** Reject if body token invalid despite header token
- [ ] **File:** csrf-protection.test.ts
- [ ] **Lines:** Add after line 154 (end of validateCsrfMiddleware tests)
- [ ] **Effort:** 20 min
- [ ] **Setup:** Mock request with json() returning { _csrf: token }

### Priority 1.3: Async-Route - Handler Status Codes
- [ ] **Test:** Handler returning 201 (Created)
- [ ] **Test:** Handler returning 204 (No Content)
- [ ] **Test:** Handler returning custom status (418)
- [ ] **File:** async-route.test.ts
- [ ] **Lines:** Add before line 265 (response structure tests)
- [ ] **Effort:** 45 min
- [ ] **Assertion:** Verify response.status matches handler response

### Priority 1.4: Error Handler - withErrorLogging Tests
- [ ] **Test:** Handler execution succeeds with logging
- [ ] **Test:** Handler execution fails with error logging
- [ ] **Test:** Duration tracked correctly
- [ ] **Test:** Status code mapped from error message
- [ ] **Test:** Response includes correlationId
- [ ] **File:** error-handler.test.ts
- [ ] **Lines:** Add new describe block after line 293
- [ ] **Effort:** 1.5 hours
- [ ] **Setup:** Create mock handler, verify logger calls

### Priority 1.5: Atomic Ops - Mock withFileLock
- [ ] **Mock:** Add jest.mock('./file-lock')
- [ ] **Test:** Verify withFileLock called with correct path
- [ ] **Test:** Verify function passed to withFileLock is async
- [ ] **File:** atomic-file-ops.test.ts
- [ ] **Lines:** Add mock at top (line 8), add tests in each describe block
- [ ] **Effort:** 1 hour
- [ ] **Verification:** All tests still pass with mocked lock

---

## PHASE 2: HIGH PRIORITY FIXES (4 hours)

### Priority 2.1: Async-Route - Context Edge Cases
- [ ] **Test:** Null context values handled
- [ ] **Test:** Undefined correlation ID generated
- [ ] **Test:** Context merging with empty options
- [ ] **File:** async-route.test.ts
- [ ] **Lines:** Add before line 207
- [ ] **Effort:** 30 min
- [ ] **Focus:** Edge cases in context composition

### Priority 2.2: Async-Route - Factory Function Tests
- [ ] **Test:** asyncPut creates PUT handler
- [ ] **Test:** asyncPatch creates PATCH handler
- [ ] **Test:** asyncDelete creates DELETE handler
- [ ] **File:** async-route.test.ts
- [ ] **Lines:** Add after line 232
- [ ] **Effort:** 30 min
- [ ] **Verification:** All 5 factories tested

### Priority 2.3: Atomic Ops - Error Scenarios
- [ ] **Test:** Large file (>10MB JSON)
- [ ] **Test:** Permission denied on write
- [ ] **Test:** Disk space exhaustion
- [ ] **Test:** Symlink handling
- [ ] **Test:** Concurrent delete during read
- [ ] **File:** atomic-file-ops.test.ts
- [ ] **Lines:** Add new describe block
- [ ] **Effort:** 2 hours
- [ ] **Setup:** Mock fs errors, create error conditions

### Priority 2.4: CSRF - Encoding Edge Cases
- [ ] **Test:** Unicode characters in token
- [ ] **Test:** Null bytes in token
- [ ] **Test:** Empty string token
- [ ] **Test:** Very long token (>1000 chars)
- [ ] **File:** csrf-protection.test.ts
- [ ] **Lines:** Add new describe block "Encoding edge cases"
- [ ] **Effort:** 1 hour
- [ ] **Assertion:** Proper rejection/acceptance of edge cases

### Priority 2.5: Error Handler - Response JSON Parsing
- [ ] **Test:** createErrorResponse includes all required fields
- [ ] **Test:** Correlation ID present in response body
- [ ] **Test:** logValidationError returns proper structure
- [ ] **Test:** logDatabaseError hides internal details
- [ ] **File:** error-handler.test.ts
- [ ] **Lines:** Update tests at lines 85-199
- [ ] **Effort:** 1.5 hours
- [ ] **Change:** Parse JSON and assert structure

---

## PHASE 3: ASSERTION & PATTERN QUALITY (2 hours)

### Priority 3.1: Fix AAA Pattern Violations
- [ ] **File:** async-route.test.ts
- [ ] **Lines:** 234-262 (timing test)
  - [ ] Separate duration check into assertion
  - [ ] Clear arrange/act/assert sections

- [ ] **File:** csrf-protection.test.ts
- [ ] **Multiple tests:** Weak mock arrangements
  - [ ] Create explicit mock builders
  - [ ] Separate from assertions

- [ ] **File:** error-handler.test.ts
- [ ] **Lines:** 296-318 (context tests)
  - [ ] Add actual function calls (act phase)
  - [ ] Verify implementation, not just mocks

- [ ] **Effort:** 1 hour

### Priority 3.2: Strengthen Weak Assertions
- [ ] **async-route.test.ts, line 204**
  - [ ] Change: `.toBeDefined()` → `.toMatch(/^[a-f0-9-]{36}$/)`
  - [ ] Verify correlation ID format

- [ ] **async-route.test.ts, line 260-261**
  - [ ] Use stricter timing bounds
  - [ ] Consider process.hrtime for accuracy

- [ ] **async-route.test.ts, line 42-47**
  - [ ] Expand objectContaining to verify all fields
  - [ ] Check method, correlationId, operation

- [ ] **csrf-protection.test.ts, line 25**
  - [ ] Change: `.toContain('missing')` → `.toMatch(/CSRF token missing/)`
  - [ ] Verify exact error message format

- [ ] **error-handler.test.ts, line 203**
  - [ ] Add: `.toHaveBeenCalledTimes(1)`
  - [ ] Verify operation was invoked

- [ ] **Effort:** 1 hour

---

## VERIFICATION CHECKLIST

After implementing fixes:

### Code Quality
- [ ] All 64 existing tests still pass
- [ ] 24 new tests pass
- [ ] Total: 88 tests
- [ ] No flaky tests (run 5 times)
- [ ] No console errors/warnings

### Coverage
- [ ] Coverage report shows 85%+ lines
- [ ] All critical paths tested
- [ ] Edge cases represented
- [ ] Error scenarios covered

### Type Safety
- [ ] No `any` types in tests
- [ ] All mocks properly typed
- [ ] No TypeScript errors
- [ ] Strict mode enabled

### Mock Quality
- [ ] All mocks verified with assertions
- [ ] Mock calls checked for correctness
- [ ] Cleanup in afterEach
- [ ] No test interdependencies

### Documentation
- [ ] Each test has descriptive name
- [ ] Complex tests have comments
- [ ] Setup/assertions clear
- [ ] Mock purposes documented

---

## Test File Updates Summary

### async-route.test.ts
**Current:** 13 tests (87%)  
**Add:** 5 tests  
**New Total:** 18 tests (91%)  
**Effort:** 1.5 hours

Changes:
```
Line 165: + describe('status code preservation')
Line 207: + describe('context edge cases')
Line 232: + describe('factory functions - all types')
Lines 42-47: Strengthen objectContaining assertion
Line 204: Strengthen correlation ID validation
```

### atomic-file-ops.test.ts
**Current:** 19 tests (85%)  
**Add:** 7 tests  
**New Total:** 26 tests (90%)  
**Effort:** 3 hours

Changes:
```
Line 7: + jest.mock('./file-lock')
Line 31-79: Add withFileLock verification
Line 290: + describe('error scenarios')
Line 315: Strengthen consistency assertions
```

### csrf-protection.test.ts
**Current:** 15 tests (80%)  
**Add:** 5 tests  
**New Total:** 20 tests (87%)  
**Effort:** 1.5 hours

Changes:
```
Line 71: + describe('timing-safe comparison')
Line 154: + describe('body token parsing')
Line 155: + describe('encoding edge cases')
Lines 25, 36: Use toMatch instead of toContain
```

### error-handler.test.ts
**Current:** 17 tests (82%)  
**Add:** 7 tests  
**New Total:** 24 tests (90%)  
**Effort:** 2.5 hours

Changes:
```
Line 293: + describe('withErrorLogging')
Lines 85-199: Add response JSON parsing
Line 203: Add operation mock verification
Lines 296-318: Convert to test actual behavior
```

---

## Git Commit Plan

### Commit 1: Critical Security & Coverage Fixes
```
commit: test: audit 28/150 - add critical test coverage

- Add CSRF timing-safe comparison tests (security)
- Add CSRF body token parsing tests (coverage)
- Add async-route handler status code tests (correctness)
- Add withErrorLogging tests (major gap)
- Mock withFileLock and verify lock behavior (reliability)

Impact:
  - Eliminates 4 CRITICAL issues
  - Adds 11 new tests
  - Raises quality from 84% to 88%
```

### Commit 2: High Priority Improvements
```
commit: test: audit 28/150 - high priority edge cases

- Add async-route context edge case tests
- Add async-route factory function tests
- Add atomic-ops error scenario tests (disk, perms, large files)
- Add CSRF encoding edge case tests
- Parse and verify response JSON in error handler tests

Impact:
  - Eliminates 5 HIGH issues
  - Adds 13 new tests
  - Raises quality from 88% to 91%
```

### Commit 3: Code Quality Improvements
```
commit: test: audit 28/150 - strengthen assertions and patterns

- Fix AAA pattern violations in 7 tests
- Strengthen weak assertions (8 updates)
- Use toMatch for format validation
- Use process.hrtime for reliable timing

Impact:
  - Improves test reliability
  - Increases assertion precision
  - Clarifies test structure
```

---

## Quality Gates

**MUST PASS before proceeding:**

- [ ] All 88 tests pass (64 original + 24 new)
- [ ] No new flaky tests (pass 5 consecutive runs)
- [ ] Coverage >= 85% on touched code
- [ ] No TypeScript errors
- [ ] No console.log in test files

**SHOULD HAVE:**

- [ ] 100% coverage on mocked functions
- [ ] All edge cases represented
- [ ] Descriptive test names
- [ ] Clear arrange/act/assert sections

---

## Timeline Estimate

| Phase | Task | Hours | Status |
|-------|------|-------|--------|
| 1.1 | CSRF timing-safe | 0.5 | [ ] |
| 1.2 | CSRF body token | 0.33 | [ ] |
| 1.3 | async-route status | 0.75 | [ ] |
| 1.4 | withErrorLogging | 1.5 | [ ] |
| 1.5 | Mock withFileLock | 1 | [ ] |
| **Phase 1 Total** | **Critical fixes** | **3.5** | [ ] |
| 2.1 | Async context cases | 0.5 | [ ] |
| 2.2 | Factory functions | 0.5 | [ ] |
| 2.3 | Error scenarios | 2 | [ ] |
| 2.4 | Encoding edge cases | 1 | [ ] |
| 2.5 | Response JSON | 1 | [ ] |
| **Phase 2 Total** | **High priority** | **4** | [ ] |
| 3.1 | AAA patterns | 1 | [ ] |
| 3.2 | Assertions | 1 | [ ] |
| **Phase 3 Total** | **Quality** | **2** | [ ] |
| **GRAND TOTAL** | **All improvements** | **9.5** | [ ] |

---

## Success Criteria

- [x] Current: 64 tests at 84% quality
- [ ] Phase 1: 75 tests at 88% quality (3.5 hours)
- [ ] Phase 2: 88 tests at 91% quality (7.5 hours)
- [ ] Phase 3: 88 tests at 92% quality (9.5 hours)

**Definition of Done:**
- All 88 tests passing
- Coverage >= 85%
- No flaky tests
- Clear AAA pattern in 100% of tests
- All assertions specific and verifiable

---

## Status Tracking

### Phase 1 Progress
- [ ] 1.1 CSRF Timing-Safe Comparison
- [ ] 1.2 CSRF Body Token Parsing
- [ ] 1.3 Async-Route Status Codes
- [ ] 1.4 withErrorLogging (5 tests)
- [ ] 1.5 Mock withFileLock (2 tests)
- [ ] Commit & Verify All Tests Pass

### Phase 2 Progress
- [ ] 2.1 Async-Route Context Edge Cases
- [ ] 2.2 Factory Functions (3 tests)
- [ ] 2.3 Atomic Ops Error Scenarios (5 tests)
- [ ] 2.4 CSRF Encoding Edge Cases (4 tests)
- [ ] 2.5 Error Handler Response JSON (2 tests)
- [ ] Commit & Verify All Tests Pass

### Phase 3 Progress
- [ ] 3.1 Fix AAA Pattern Violations (7 tests)
- [ ] 3.2 Strengthen Weak Assertions (8 updates)
- [ ] Final Verification & Review
- [ ] Commit & Final Push

---

**Generated:** 2026-10-22  
**For:** Test Audit 28/150  
**Quality Target:** 92/100  
**Total Commitment:** 9.5 hours
