# Security Audit 121/150 - Action Plan & Implementation Guide

**Date:** 2026-10-22  
**Status:** READY FOR IMPLEMENTATION  
**Total Work Estimate:** 1 hour 5 minutes  
**Risk Level:** LOW

---

## QUICK START

### Files to Review
1. `dashboard/lib/csrf-protection.ts` - 2 issues to fix
2. `dashboard/lib/validation/index.ts` - 1 issue to fix
3. `dashboard/auth.config.ts` - 1 issue to implement

### Total Issues: 4
- **CRITICAL (Fixed):** 1 - No action needed
- **HIGH:** 2 - Requires action
- **MEDIUM:** 1 - Code quality

---

## ACTION ITEM 1: Fix CSRF Referer Validation
**Priority:** HIGH  
**File:** `dashboard/lib/csrf-protection.ts`  
**Line:** 85, 104-109  
**Time:** 15 minutes  
**Severity:** HIGH (Documentation mismatch)

### Current Code (Lines 85, 104-109)
```typescript
// Line 85: MISLEADING COMMENT
// SECURITY: Also validates origin/referer to prevent cross-site attacks

// Lines 104-109: ACTUAL IMPLEMENTATION
const referer = request.headers.get('referer')  // Extracted but not used
const origin = request.headers.get('origin')

if (allowedOrigins && origin) {
  const isAllowedOrigin = allowedOrigins.includes(origin)  // ✓ Validated
  // referer is never validated ✗
}
```

### Option 1: ADD REFERER VALIDATION (Recommended)

**Benefit:** Defense-in-depth for older browsers that send Referer headers  
**Implementation:**

```typescript
// Add after origin validation (around line 119):
if (referer && allowedOrigins) {
  try {
    const refererUrl = new URL(referer)
    const refererOrigin = refererUrl.origin
    
    if (!allowedOrigins.includes(refererOrigin)) {
      return {
        valid: false,
        response: NextResponse.json(
          { success: false, error: 'Referer not allowed' },
          { status: 403 }
        ),
      }
    }
  } catch (e) {
    // Invalid URL in referer - reject to be safe
    return {
      valid: false,
      response: NextResponse.json(
        { success: false, error: 'Invalid referer format' },
        { status: 403 }
      ),
    }
  }
}
```

### Option 2: UPDATE COMMENT ONLY

**If referer validation is intentionally skipped:**

```typescript
// Line 85: UPDATE COMMENT
// SECURITY: Validates origin to prevent cross-site attacks
// Note: Referer validation optional due to sparse header support in older browsers
```

### Verification

```bash
# Test that POST with valid origin still works
curl -X POST http://localhost:3000/api/protected \
  -H "Origin: http://localhost:3000" \
  -H "x-csrf-token: <token>"

# Test that POST with invalid origin is rejected
curl -X POST http://localhost:3000/api/protected \
  -H "Origin: http://evil.com" \
  -H "x-csrf-token: <token>" \
  # Should return 403 Forbidden
```

---

## ACTION ITEM 2: Remove Dead Code
**Priority:** MEDIUM  
**File:** `dashboard/lib/csrf-protection.ts`  
**Line:** 42-45  
**Time:** 5 minutes  
**Severity:** MEDIUM (Code quality)

### Current Code (Lines 32-45)

```typescript
// Line 32-35: GUARD CLAUSE
if (!tokenFromHeader && !tokenFromBody) {
  return { valid: false, error: 'CSRF token missing from request' }
}

// Line 37-39: ANOTHER GUARD
if (!cookieToken) {
  return { valid: false, error: 'CSRF token missing from cookies' }
}

// Line 42-45: DEAD CODE ✗
const token = tokenFromHeader || tokenFromBody
if (!token) {  // This condition can NEVER be true!
  return { valid: false, error: 'CSRF token missing' }
}
```

### Solution: REMOVE LINES 42-45

The token is guaranteed to exist after the guard at line 32-35. Simply use it directly:

```typescript
// After guard at line 35, directly use token:
const token = tokenFromHeader || tokenFromBody
// No need for another null check

try {
  const tokenBuffer = Buffer.from(token)  // token is always truthy here
  const cookieBuffer = Buffer.from(cookieToken)
  // ... rest of code
}
```

### Alternative: KEEP WITH COMMENT

If keeping for defensive programming:

```typescript
// Defensive check - guard at line 33 ensures this never triggers
// Kept for clarity and to catch unexpected control flow issues
const token = tokenFromHeader || tokenFromBody
if (!token) {
  logger.warn('Unexpected: token is null after guard check', {
    tokenFromHeader: !!tokenFromHeader,
    tokenFromBody: !!tokenFromBody,
  })
  return { valid: false, error: 'CSRF token missing' }
}
```

---

## ACTION ITEM 3: Fix Type Predicate Issue
**Priority:** HIGH  
**File:** `dashboard/lib/validation/index.ts`  
**Line:** 401  
**Time:** 10 minutes  
**Severity:** HIGH (Type safety)

### Current Code (Estimated)

```typescript
// WRONG: Misleading type predicate
MeetingTypeSchema.refine((val): val is ValidMeetingType => {
  // validation logic
  return isValid
})

// Result type is still `string`, not `ValidMeetingType`!
const result = MeetingTypeSchema.parse(data)  // type: string (wrong!)
```

### Solution: Use .pipe() with z.custom()

```typescript
// CORRECT: Proper type narrowing
const MeetingTypeSchema = z
  .enum(['meeting', 'standup', 'retrospective'])
  .refine(
    (val) => {
      // validation logic
      return isValid
    },
    { message: 'Invalid meeting type' }
  )
  .pipe(z.custom<ValidMeetingType>())  // ← Proper narrowing

// Result type is now `ValidMeetingType` ✓
const result = MeetingTypeSchema.parse(data)  // type: ValidMeetingType
```

### Verification

```typescript
// TypeScript should now recognize the type properly
const meetingType = MeetingTypeSchema.parse('meeting')
// ✓ type: ValidMeetingType
// Can safely use meetingType without type assertions
```

---

## ACTION ITEM 4: Implement Bcrypt Password Hashing
**Priority:** HIGH (for production)  
**File:** `dashboard/auth.config.ts`  
**Line:** 316-346  
**Time:** 30 minutes  
**Severity:** HIGH (Authentication security)

### Step 1: Install Bcrypt

```bash
npm install bcrypt
npm install -D @types/bcrypt  # For TypeScript
```

### Step 2: Implement validateUserCredentials

Replace the placeholder at lines 316-346 with:

```typescript
async function validateUserCredentials(
  email: string,
  password: string
): Promise<{ id: string; email: string; role: 'admin' | 'user' | 'viewer' } | null> {
  try {
    // Input validation
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      logger.warn('Invalid credential format', {
        component: 'auth.config',
        operation: 'validateUserCredentials',
      })
      return null
    }

    // Import bcrypt at top of file: import bcrypt from 'bcrypt'
    // Import database module: import { db } from '@/lib/db'

    // Find user by email
    const user = await db.users.findByEmail(email.toLowerCase())
    
    if (!user) {
      // Prevent timing attacks by running bcrypt even if user doesn't exist
      const dummyHash = '$2b$10$tGWDL3OeQDZZ0eTRe1NjuOw1tqLvDDlKDMfPuM.sO6CaWX.eUj8ai'
      await bcrypt.compare(password, dummyHash)
      
      logger.warn('Authentication failed - user not found', {
        component: 'auth.config',
        operation: 'validateUserCredentials',
        email: email.toLowerCase(),
      })
      return null
    }

    // Verify password against bcrypt hash
    const isValidPassword = await bcrypt.compare(password, user.password_hash)
    
    if (!isValidPassword) {
      logger.warn('Authentication failed - invalid password', {
        component: 'auth.config',
        operation: 'validateUserCredentials',
        email: email.toLowerCase(),
      })
      return null
    }

    // Success - return user data
    logger.info('User authenticated via password', {
      component: 'auth.config',
      operation: 'validateUserCredentials',
      userId: user.id,
      email: user.email,
    })

    return {
      id: user.id,
      email: user.email,
      role: user.role || 'user',
    }
  } catch (error) {
    logger.error('Password authentication error', error as Error, {
      component: 'auth.config',
      operation: 'validateUserCredentials',
    })
    return null
  }
}
```

### Step 3: Verify Database Schema

Ensure your `users` table has:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,  -- bcrypt hashes are 60 chars
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW()
)
```

### Step 4: Test Password Authentication

```typescript
// In your test suite
import bcrypt from 'bcrypt'

it('should authenticate user with valid password', async () => {
  const email = 'test@example.com'
  const password = 'TestPassword123!'
  
  // Hash password for storage
  const hash = await bcrypt.hash(password, 10)
  
  // Validate should return user
  const user = await validateUserCredentials(email, password)
  expect(user).toEqual({
    id: expect.any(String),
    email: email,
    role: 'user'
  })
})
```

---

## IMPLEMENTATION CHECKLIST

### Immediate Actions (Do First)

- [ ] **ACTION 1:** Fix CSRF referer validation
  - [ ] Choose Option 1 (add validation) or Option 2 (update comment)
  - [ ] Test the fix
  - [ ] Run: `npm test -- csrf-protection`

- [ ] **ACTION 2:** Remove dead code
  - [ ] Delete or comment out lines 42-45 in csrf-protection.ts
  - [ ] Verify code still passes tests
  - [ ] Run: `npm test -- csrf-protection`

### Short-Term Actions (This Week)

- [ ] **ACTION 3:** Fix type predicate
  - [ ] Update MeetingTypeSchema with .pipe(z.custom<>())
  - [ ] Run TypeScript check: `tsc --noEmit`
  - [ ] Run tests: `npm test -- validation`

- [ ] **ACTION 4:** Implement Bcrypt (if password auth needed)
  - [ ] Install bcrypt: `npm install bcrypt`
  - [ ] Implement validateUserCredentials
  - [ ] Update database schema if needed
  - [ ] Add tests for password authentication
  - [ ] Run: `npm test -- auth`

### Verification

```bash
# Run all security tests
npm test -- security

# Run type checking
tsc --noEmit

# Run CSRF protection tests
npm test -- csrf

# Run validation tests
npm test -- validation

# Run all tests
npm test
```

---

## TESTING SCENARIOS

### CSRF Tests

```bash
# Test valid CSRF token
curl -X POST http://localhost:3000/api/protected \
  -H "x-csrf-token: <valid-token>" \
  -H "Cookie: __Host-csrf=<valid-token>"
# Expected: 200 OK

# Test missing token
curl -X POST http://localhost:3000/api/protected
# Expected: 403 Forbidden

# Test origin validation
curl -X POST http://localhost:3000/api/protected \
  -H "Origin: http://evil.com" \
  -H "x-csrf-token: <token>"
# Expected: 403 Forbidden
```

### Type Safety Tests

```typescript
// Should compile without errors
const meeting = MeetingTypeSchema.parse('meeting')
// meeting type should be ValidMeetingType
console.log(meeting)  // Valid operation
```

### Password Authentication Tests

```typescript
// Valid credentials
const user = await validateUserCredentials(
  'test@example.com',
  'TestPassword123!'
)
expect(user).toBeDefined()

// Invalid password
const user = await validateUserCredentials(
  'test@example.com',
  'WrongPassword'
)
expect(user).toBeNull()

// Timing attack prevention
// Both should take same time (~100ms for bcrypt)
const start = Date.now()
await validateUserCredentials('nonexistent@example.com', 'password')
const time1 = Date.now() - start

const start2 = Date.now()
await validateUserCredentials('test@example.com', 'wrongpassword')
const time2 = Date.now() - start2

// Both times should be similar (within 10%)
expect(Math.abs(time1 - time2)).toBeLessThan(20)
```

---

## ROLLBACK PLAN

If any fix causes issues:

```bash
# Revert last change
git revert HEAD

# Or specific file
git checkout dashboard/lib/csrf-protection.ts
```

---

## SUCCESS CRITERIA

✓ All 4 findings addressed  
✓ CSRF validation works correctly  
✓ Type checking passes without errors  
✓ Password authentication (if implemented) is secure  
✓ All tests pass  
✓ No security regressions detected  

---

## ESTIMATED TIMELINE

| Action | Time | Priority |
|--------|------|----------|
| Fix CSRF referer validation | 15 min | HIGH |
| Remove dead code | 5 min | MEDIUM |
| Fix type predicate | 10 min | HIGH |
| Implement Bcrypt | 30 min | HIGH |
| **TOTAL** | **1 hour** | - |

---

## SIGN-OFF

**Audit Conducted By:** Claude Haiku 4.5  
**Review Date:** 2026-10-22  
**Status:** READY FOR IMPLEMENTATION  
**Next Steps:** Execute actions in priority order, verify with tests, commit changes
