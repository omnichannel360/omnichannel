# TEST AUDIT 34/150 - CONSOLIDATED ACTION ITEMS

**Status:** Ready for Implementation  
**Effort:** 6-8 hours  
**Priority:** TIER 1 (Immediate)  
**Target Quality:** 92/100 (up from 84/100)

---

## QUICK REFERENCE: PHASES & TIMELINE

| Phase | Duration | Items | Status | Blocker? |
|-------|----------|-------|--------|----------|
| 1. Syntax Fixes | 0.5h | 3 items | Ready | YES ← FIX FIRST |
| 2. Security Tests | 1.5h | 4 items | Documented | YES |
| 3. Coverage Tests | 2.0h | 8 items | Documented | NO |
| 4. Edge Cases | 2.0h | 8 items | Documented | NO |
| 5. AAA Pattern | 1.0h | 3 items | Documented | NO |
| 6. Assertions | 1.0h | 6 items | Ready | NO |
| **TOTAL** | **8h** | **32 items** | **Ready** | ✅ |

---

## PHASE 1: SYNTAX ERRORS (BLOCKING - 0.5 hours)

**Files Affected:** 2 files  
**Items:** 3 fixes  
**Status:** All fixes identified, ready to apply  

### Fix 1.1: async-route.test.ts - Remove Orphaned afterEach

**File:** `dashboard/__tests__/api/async-route.test.ts`  
**Lines:** 144-149  
**Action:** DELETE these lines (they are syntactically invalid)  

```typescript
    afterEach(() => {
      vi.clearAllMocks()
    })
    }))
```

**Result:** Clean up malformed block  
**Verification:** `tsc --noEmit` should pass

---

### Fix 1.2: async-route.test.ts - Complete Custom Error Formatter Test

**File:** `dashboard/__tests__/api/async-route.test.ts`  
**Lines:** 136-167  
**Action:** Replace broken code with complete test  

[See TEST_AUDIT_29_REMEDIATION_GUIDE.md Line 37-109 for exact code]

**Result:** Test compiles and passes  
**Verification:** `npm test -- async-route.test.ts` passes

---

### Fix 1.3: error-handler.test.ts - Remove Misplaced afterEach

**File:** `dashboard/__tests__/api/error-handler.test.ts`  
**Lines:** 135-137  
**Action:** DELETE these 3 lines (afterEach should not be inside test function)  

```typescript
      afterEach(() => {
        vi.clearAllMocks()
      })
```

**Result:** Removes misplaced hook  
**Verification:** `tsc --noEmit` should pass

---

## PHASE 2: SECURITY TESTS (CRITICAL - 1.5 hours)

**Files Affected:** 1 file  
**Items:** 4 test blocks to add  
**Status:** All test code documented in TEST_AUDIT_29_REMEDIATION_GUIDE.md  

### Security Test 2.1: CSRF Token Expiration

**File:** `dashboard/__tests__/api/csrf-protection.test.ts`  
**Action:** ADD new test block (See remediation guide line 180-197)  
**Effort:** 30 min  

Tests:
- Token expires after 24 hours
- Expired tokens are rejected
- Error message indicates expiration

---

### Security Test 2.2: Cookie Security Flags

**File:** `dashboard/__tests__/api/csrf-protection.test.ts`  
**Action:** ADD new test block (See remediation guide line 210-225)  
**Effort:** 20 min  

Tests:
- Secure flag present (HTTPS only)
- HttpOnly flag present (no JavaScript access)
- SameSite=Strict flag present

---

### Security Test 2.3: Timing-Safe Comparison

**File:** `dashboard/__tests__/api/csrf-protection.test.ts`  
**Action:** ADD new test verifying crypto.timingSafeEqual()  
**Effort:** 30 min  

Tests:
- Timing-safe comparison prevents timing attacks
- Equal buffers return true
- Unequal buffers return false
- Timing constant regardless of difference position

---

### Security Test 2.4: SameSite Enforcement

**File:** `dashboard/__tests__/api/csrf-protection.test.ts`  
**Action:** ADD new test block (See remediation guide line 240-259)  
**Effort:** 20 min  

Tests:
- Requests from different origins are rejected
- Error response has 403 status code
- Correct error message in response

---

## PHASE 3: COVERAGE TESTS (HIGH PRIORITY - 2.0 hours)

**Files Affected:** 4 files  
**Items:** 8 test blocks to add  
**Status:** All test code documented in TEST_AUDIT_29_REMEDIATION_GUIDE.md  

### Coverage Test 3.1: withErrorLogging Function (1.5 hours)

**File:** `dashboard/__tests__/api/error-handler.test.ts`  
**Action:** ADD new describe block with 5 comprehensive tests  
**Location:** After line 200  
**Effort:** 1.5 hours  

Tests needed:
1. withErrorLogging wraps handler successfully
2. Logs errors with correct context
3. Preserves error type and message
4. Adds correlation ID to logs
5. Returns proper error response

---

### Coverage Test 3.2: Handler Status Codes (45 min)

**File:** `dashboard/__tests__/api/async-route.test.ts`  
**Action:** ADD 3 new tests for different status codes  
**Effort:** 45 min  

Tests needed:
1. Handler returning 201 (Created)
2. Handler returning 204 (No Content)
3. Handler returning non-2xx codes preserved

---

### Coverage Test 3.3: Atomic File Operations Errors (2.0 hours)

**File:** `dashboard/__tests__/lib/atomic-file-ops.test.ts`  
**Action:** ADD new describe block with 5 error scenario tests  
**Location:** After line 323  
**Effort:** 2.0 hours  

Tests needed:
1. Handles disk space exhaustion
2. Handles permission denied errors
3. Handles large file (>100MB) handling
4. Handles concurrent read+delete
5. Handles cleanup failures gracefully

---

### Coverage Test 3.4: Error Type Coverage (45 min)

**File:** `dashboard/__tests__/api/error-handler.test.ts`  
**Action:** ADD new describe block with 3 error type tests  
**Location:** After line 200  
**Effort:** 45 min  
**Reference:** TEST_AUDIT_29_REMEDIATION_GUIDE.md line 361-409

Tests needed:
1. RangeError handling
2. ReferenceError handling
3. Custom error class handling

---

## PHASE 4: EDGE CASES (MEDIUM PRIORITY - 2.0 hours)

**Files Affected:** 3 files  
**Items:** 8 test blocks to add  
**Status:** Code templates provided in remediation guide  

### Edge Case 4.1: Large Response Bodies

**File:** `dashboard/__tests__/api/async-route.test.ts`  
**Action:** ADD test for >1MB response  
**Reference:** TEST_AUDIT_29_REMEDIATION_GUIDE.md line 486-509  
**Effort:** 30 min

---

### Edge Case 4.2: Cleanup & Recovery Scenarios

**File:** `dashboard/__tests__/lib/atomic-file-ops.test.ts`  
**Action:** ADD describe block with 2 tests  
**Reference:** TEST_AUDIT_29_REMEDIATION_GUIDE.md line 520-554  
**Effort:** 30 min

---

### Edge Case 4.3: Performance Benchmarks

**File:** `dashboard/__tests__/api/validation.test.ts` or similar  
**Action:** ADD describe block with 3 performance tests  
**Reference:** TEST_AUDIT_29_REMEDIATION_GUIDE.md line 565-595  
**Effort:** 30 min

---

### Edge Case 4.4-8: Additional Edge Cases

CSRF protection:
- Unicode tokens with null bytes
- Very long tokens (>1000 chars)
- Buffer encoding edge cases
- Empty string tokens
- Origin/Referer validation

---

## PHASE 5: AAA PATTERN REFACTORING (1.0 hour)

**Files Affected:** 3 files  
**Items:** 3 test refactorings  
**Effort:** 15-30 min each  

### Refactor 5.1: async-route.test.ts Timing Test

**File:** `dashboard/__tests__/api/async-route.test.ts`  
**Lines:** 234-262  
**Issue:** Duration check mixed with action (no clear Arrange/Act/Assert)  
**Action:** Restructure test to follow AAA pattern explicitly

---

### Refactor 5.2: error-handler.test.ts Context Tests

**File:** `dashboard/__tests__/api/error-handler.test.ts`  
**Lines:** 296-318  
**Issue:** No arrange/act phases, only assert on mocks  
**Action:** Add explicit test setup phase

---

### Refactor 5.3: csrf-protection.test.ts Weak Arrange

**File:** `dashboard/__tests__/api/csrf-protection.test.ts`  
**Issue:** Multiple tests with loose mock setup  
**Action:** Add clear, complete test fixtures

---

## PHASE 6: ASSERTION STRENGTHENING (1.0 hour)

**Files Affected:** 4 files  
**Items:** 6 assertion replacements  
**Status:** Ready to execute  

### Assertion 6.1: UUID Validation

**File:** `dashboard/__tests__/api/async-route.test.ts` Line 204  
**Current:** `.toBeDefined()`  
**Replace:** `.toMatch(/^[a-f0-9-]{36}$/)`  
**Benefit:** Verifies UUID format, not just existence

---

### Assertion 6.2: Object Matching

**File:** `dashboard/__tests__/api/async-route.test.ts` Line 42  
**Current:** `expect.objectContaining()`  
**Replace:** Full equality with all required fields  
**Benefit:** Verifies all context fields present

---

### Assertion 6.3: Timing Assertion

**File:** `dashboard/__tests__/api/async-route.test.ts` Lines 254-265  
**Current:** `toBeGreaterThanOrEqual(5)` + `toBeLessThan(5000)`  
**Replace:** `toBeGreaterThanOrEqual(1)` + `toBeLessThan(500)`  
**Benefit:** Tighter bounds catch performance regressions

---

### Assertion 6.4: Error Message Matching

**File:** `dashboard/__tests__/api/csrf-protection.test.ts` Line 25  
**Current:** `.toContain('missing')`  
**Replace:** `.toMatch(/CSRF token missing/)`  
**Benefit:** Pattern matching more precise than substring

---

### Assertion 6.5: Token Format Validation

**File:** `dashboard/__tests__/api/csrf-protection.test.ts` Line 80  
**Current:** `.toBeDefined()`  
**Replace:** `.toMatch(/^[a-zA-Z0-9]+$/)`  
**Benefit:** Validates token format/content

---

### Assertion 6.6: Response JSON Parsing

**File:** `dashboard/__tests__/api/error-handler.test.ts` Line 101  
**Current:** No JSON parsing, just checks status  
**Replace:** Parse and assert response body structure  
**Benefit:** Verifies error response format

---

## IMPLEMENTATION CHECKLIST

Before Starting:
- [ ] Create new branch: `git checkout -b test/audit-34-comprehensive`
- [ ] Read TEST_AUDIT_29_REMEDIATION_GUIDE.md completely
- [ ] Backup current test files (git has history)

Phase 1 (Syntax Fixes - ~30 min):
- [ ] Fix async-route.test.ts orphaned afterEach (Fix 1.1)
- [ ] Complete customFormatter test (Fix 1.2)
- [ ] Remove error-handler.test.ts afterEach (Fix 1.3)
- [ ] Verify: `tsc --noEmit` passes
- [ ] Verify: `npm test -- --passWithNoTests` passes

Phase 2 (Security Tests - ~1.5 hours):
- [ ] Add CSRF token expiration test (Test 2.1)
- [ ] Add cookie security flags test (Test 2.2)
- [ ] Add timing-safe comparison test (Test 2.3)
- [ ] Add SameSite enforcement test (Test 2.4)
- [ ] Verify: `npm test -- csrf-protection.test.ts` passes

Phase 3 (Coverage Tests - ~2.0 hours):
- [ ] Add withErrorLogging tests (5 tests)
- [ ] Add handler status code tests (3 tests)
- [ ] Add atomic file error tests (5 tests)
- [ ] Add error type tests (3 tests)
- [ ] Remove unused variable in atomic-file-ops.test.ts
- [ ] Verify: Coverage increased to 85%+

Phase 4 (Edge Cases - ~2.0 hours):
- [ ] Add large response test
- [ ] Add cleanup scenarios
- [ ] Add performance benchmarks
- [ ] Add remaining edge case tests
- [ ] Verify: All new tests pass

Phase 5 (AAA Pattern - ~1.0 hour):
- [ ] Refactor async-route.test.ts timing test
- [ ] Refactor error-handler.test.ts context tests
- [ ] Refactor csrf-protection.test.ts fixtures
- [ ] Verify: All tests still pass

Phase 6 (Assertions - ~1.0 hour):
- [ ] Strengthen all 6 assertions
- [ ] Verify: `npm test -- --coverage` shows 88%+
- [ ] Verify: `tsc --noEmit` passes

Final Verification:
- [ ] Full test suite passes: `npm test`
- [ ] Coverage >= 85%: `npm test -- --coverage`
- [ ] No TypeScript errors: `tsc --noEmit`
- [ ] No linting issues: `npm run lint`

Commit & Push:
- [ ] Stage all files: `git add .`
- [ ] Commit with message: `test: audit 34/150 - comprehensive overhaul (syntax, security, coverage, AAA, assertions)`
- [ ] Push: `git push -u origin test/audit-34-comprehensive`
- [ ] Create pull request with this action items document

---

## SUCCESS CRITERIA

✅ **Phase 1 Complete:**
- No TypeScript compile errors
- All syntax valid

✅ **Phase 2 Complete:**
- 4 new security tests added
- CSRF protection fully tested

✅ **Phase 3 Complete:**
- 16 new tests added (coverage tests)
- Coverage >= 85%

✅ **Phase 4 Complete:**
- 8 new tests added (edge cases)
- All identified edge cases covered

✅ **Phase 5 Complete:**
- 100% AAA pattern compliance
- All tests follow clear Arrange→Act→Assert flow

✅ **Phase 6 Complete:**
- All assertions specific and strong
- No loose matchers remaining

**FINAL GATE:**
- [ ] Quality Score: 92+/100
- [ ] Coverage: 88%+
- [ ] Sigma Level: 4.2+
- [ ] CRITICAL Issues: 0
- [ ] HIGH Issues: 0

---

## ESTIMATED EFFORT BREAKDOWN

| Phase | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| Setup & Planning | 0.5h | - | Review docs |
| Phase 1 (Syntax) | 0.5h | TBD | Quick wins |
| Phase 2 (Security) | 1.5h | TBD | Blocking |
| Phase 3 (Coverage) | 2.0h | TBD | Largest phase |
| Phase 4 (Edges) | 1.5h | TBD | Important gaps |
| Phase 5 (AAA) | 1.0h | TBD | Refactoring |
| Phase 6 (Assertions) | 0.5h | TBD | Pattern-based |
| Verification | 1.0h | TBD | Testing & review |
| **TOTAL** | **8h** | TBD | Track actuals |

---

## RESOURCES

- **Exact Code:** TEST_AUDIT_29_REMEDIATION_GUIDE.md
- **Full Analysis:** TEST_AUDIT_34_COMPREHENSIVE_REPORT.md
- **Testing Guide:** ~/.claude/rules/ecc/common/testing.md
- **TypeScript Guide:** ~/.claude/rules/ecc/typescript/coding-style.md

---

## SUPPORT / ESCALATION

If you encounter issues:

1. **Syntax Errors:** Run `tsc --noEmit` to identify line numbers
2. **Test Failures:** Run individual file: `npm test -- filename.test.ts`
3. **Coverage Issues:** Run `npm test -- --coverage` to see detailed report
4. **Import Errors:** Check that mocks are correctly imported
5. **Assertion Failures:** Compare with TEST_AUDIT_29_REMEDIATION_GUIDE.md

**Escalation:** If blocked on a phase, check the detailed analysis in TEST_AUDIT_34_COMPREHENSIVE_REPORT.md (ANALYZE section) for root cause details.

---

## NEXT STEPS AFTER COMPLETION

1. **Merge PR** once all tests pass and code review approved
2. **Create Audit 35** in 2 weeks to verify sustainability
3. **Establish automated monitoring** per CONTROL MEASURES section
4. **Train team** on improvements made (1 hour workshop)
5. **Update TESTING_STANDARDS.md** with lessons learned

---

**Document Updated:** 2026-10-22  
**Status:** READY FOR IMPLEMENTATION  
**Difficulty:** Medium (mostly copy/paste + minor refactoring)  
**Risk Level:** Low (isolated to tests, no production code changes)
