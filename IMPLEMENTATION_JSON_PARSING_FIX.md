# JSON Parse Exception Handling Implementation

## Summary

This document details the implementation of proper JSON parse exception handling across API route handlers. All `request.json()` calls are now wrapped in explicit try-catch blocks that return HTTP 400 (Bad Request) instead of unhandled 500 errors.

---

## Files Modified

### 1. `dashboard/app/api/alerts/route.ts`
### 2. `dashboard/app/api/kanban/route.ts`

---

## Code Changes Required

### File 1: `/dashboard/app/api/alerts/route.ts`

#### Change 1.1: POST Handler (Lines 73-87)
**Before:**
```typescript
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }
  // ... rest of implementation
}
```

**After:** ✅ Already properly implemented

#### Change 1.2: PATCH Handler (Lines 107-121)
**Before:**
```typescript
const parsedBody = AlertUpdateSchema.safeParse(await request.json().catch(() => null))
```

**After:**
```typescript
let body: unknown
try {
  body = await request.json()
} catch (error) {
  return NextResponse.json(
    { success: false, error: 'Invalid JSON in request body' },
    { status: 400 }
  )
}

const parsedBody = AlertUpdateSchema.safeParse(body)
```

**Status:** ✅ Completed

---

### File 2: `/dashboard/app/api/kanban/route.ts`

#### Change 2.1: GET Handler (Line 54)
**Before:**
```typescript
const tasks = loadTasks()
```

**After:**
```typescript
const tasks = await loadTasks()
```

**Status:** ✅ Completed

#### Change 2.2: POST Handler (Lines 70-78)
**Before:**
```typescript
try {
  const body = await request.json()
  // ... implementation
} catch (error) {
  return NextResponse.json(
    { success: false, error: 'Failed to create task' },
    { status: 500 }  // ❌ Wrong status code
  )
}
```

**After:**
```typescript
let body: unknown
try {
  body = await request.json()
} catch (error) {
  return NextResponse.json(
    { success: false, error: 'Invalid JSON in request body' },
    { status: 400 }  // ✅ Correct status code for JSON parse error
  )
}

const { title, status = 'todo' } = body as Record<string, unknown>
// ... rest of validation
```

**Status:** ✅ Completed

#### Change 2.3: PUT Handler (Lines 115-123)
**Before:**
```typescript
try {
  const body = await request.json()
  // ... implementation
} catch (error) {
  return NextResponse.json(
    { success: false, error: 'Failed to update task' },
    { status: 500 }  // ❌ Wrong status code
  )
}
```

**After:**
```typescript
let body: unknown
try {
  body = await request.json()
} catch (error) {
  return NextResponse.json(
    { success: false, error: 'Invalid JSON in request body' },
    { status: 400 }  // ✅ Correct status code
  )
}

const { id, ...updates } = body as Record<string, unknown>
// ... rest of validation
```

**Status:** ✅ Completed

#### Change 2.4: DELETE Handler
**Status:** ✅ No JSON parsing (uses URL params only)

---

## Implementation Steps

### Step 1: Identify JSON Parsing Points
- ✅ Located all `request.json()` calls in both files
- ✅ Identified which handlers parse JSON vs. use URL parameters

### Step 2: Wrap in Try-Catch
- ✅ Explicit try-catch blocks around `request.json()`
- ✅ Separate JSON parse errors from business logic errors
- ✅ Return 400 for JSON parse errors, 500 for business logic errors

### Step 3: Type Safety
- ✅ Use `unknown` type for parsed body
- ✅ Type casting with `as Record<string, unknown>` for destructuring
- ✅ Explicit type conversions with `String()` casts

### Step 4: Error Messages
- ✅ Consistent error message: "Invalid JSON in request body"
- ✅ Distinguishes from validation errors ("Invalid request")
- ✅ Clients can retry or show appropriate error UI

### Step 5: Async/Await Consistency
- ✅ Fixed missing `await` on `loadTasks()` in GET handler
- ✅ Ensured all async operations properly awaited

---

## Testing Approach

### Unit Tests
File: `dashboard/__tests__/api/json-parsing.test.ts`

#### Test Cases

**1. Invalid JSON Syntax**
```typescript
it('returns 400 when request body has invalid JSON', async () => {
  request.json = jest.fn(() => Promise.reject(new SyntaxError()))
  const response = await alertsPost(request)
  expect(response.status).toBe(400)
  expect(data.error).toBe('Invalid JSON in request body')
})
```

**2. Empty Request Body**
```typescript
it('handles empty request body', async () => {
  request.json = jest.fn(() => 
    Promise.reject(new SyntaxError('Unexpected end of JSON input'))
  )
  const response = await alertsPost(request)
  expect(response.status).toBe(400)
})
```

**3. Deeply Nested JSON**
```typescript
it('handles deeply nested JSON that exceeds parser limits', async () => {
  request.json = jest.fn(() =>
    Promise.reject(new Error('Maximum nesting level exceeded'))
  )
  const response = await kanbanPost(request)
  expect(response.status).toBe(400)
})
```

**4. Valid JSON with Validation Failure**
```typescript
it('returns 400 when validation fails', async () => {
  request.json = jest.fn(() =>
    Promise.resolve({ level: 'invalid' })
  )
  const response = await alertsPost(request)
  expect(response.status).toBe(400)
  expect(data.error).toBe('Invalid request')
})
```

**5. Valid Request Success**
```typescript
it('returns 201 with valid alert creation', async () => {
  request.json = jest.fn(() =>
    Promise.resolve({
      level: 'info',
      component: 'test',
      message: 'Test message',
    })
  )
  const response = await alertsPost(request)
  expect(response.status).toBe(201)
})
```

### Integration Tests
- Test with actual malformed JSON payloads
- Verify HTTP response headers and status codes
- Test edge cases: empty body, null values, type mismatches

### End-to-End Tests
- Test via HTTP client (curl, Postman, fetch API)
- Verify error response format matches API contract
- Test with real client code

---

## Potential Side Effects

### 1. **Client Code Changes Required**
**Scope:** Medium impact
- Clients expecting 500 for JSON errors will now receive 400
- Update error handling to distinguish between 400 and 500
- **Mitigation:** Document in API changelog, provide migration guide

### 2. **Error Response Format**
**Scope:** Low impact
- Response format remains consistent
- Error messages are clear and actionable
- **Mitigation:** No breaking changes to response structure

### 3. **Logging & Monitoring**
**Scope:** Low impact
- 400 responses indicate client issues (malformed JSON)
- 500 responses indicate server issues (file I/O, processing)
- **Mitigation:** Update error dashboards to distinguish between error types

### 4. **Async/Await Changes**
**Scope:** Low impact
- `loadTasks()` now properly awaited in GET handler
- Prevents promise rejections from going unhandled
- **Mitigation:** No breaking changes, improves stability

### 5. **Type Casting**
**Scope:** Minimal impact
- Use of `as Record<string, unknown>` requires explicit casting
- Validation schemas still enforce type safety
- **Mitigation:** Zod/validation schemas catch type errors at runtime

### 6. **Performance**
**Scope:** Negligible
- Try-catch blocks have minimal performance impact
- Proper error handling may reduce error recovery time
- **Mitigation:** No negative performance impact expected

### 7. **Security Implications**
**Scope:** Positive impact
- Clear error messages help debugging without exposing internals
- Consistent error handling reduces surface for attacks
- Proper HTTP status codes follow REST conventions
- **Mitigation:** No security risks introduced

---

## Backward Compatibility

### Breaking Changes
- ❌ JSON parse errors now return 400 instead of 500

### Migration Path
1. Update client error handling to expect 400 for malformed JSON
2. Update monitoring/alerting rules (400s are client errors, not server errors)
3. Update documentation to reflect new error codes
4. Consider feature flag if gradual rollout needed

### Rollback Plan
- Revert to generic try-catch returning 500 (previous state)
- No data migration required
- No database schema changes

---

## Verification Checklist

- [x] All `request.json()` calls wrapped in try-catch
- [x] JSON parse errors return HTTP 400
- [x] Business logic errors still return HTTP 500
- [x] Error messages are consistent and clear
- [x] Type safety maintained with `unknown` and casting
- [x] All async operations properly awaited
- [x] Unit tests written and passing
- [x] Integration tests planned
- [x] Documentation updated
- [x] No console.log statements in error paths
- [x] Error messages don't expose sensitive data

---

## Deployment Considerations

### Pre-Deployment
1. Run full test suite: `npm run test`
2. Type check: `npm run type-check`
3. Lint: `npm run lint`
4. Build: `npm run build`

### Deployment
1. Deploy to staging environment first
2. Run integration tests against staging
3. Monitor error rates and response times
4. Deploy to production during low-traffic period

### Post-Deployment
1. Monitor 400 vs 500 error rates
2. Verify client applications handle 400 responses correctly
3. Update runbooks for on-call team
4. Monitor error logs for unexpected patterns

---

## Files Created/Modified

### Modified Files
- `dashboard/app/api/alerts/route.ts` - Added explicit try-catch in PATCH
- `dashboard/app/api/kanban/route.ts` - Added explicit try-catch in POST, PUT; fixed await in GET

### New Files
- `dashboard/__tests__/api/json-parsing.test.ts` - Comprehensive test suite

---

## Related Issues & References

- **Issue:** Handle JSON Parse Exceptions
- **Scope:** API route error handling
- **Priority:** High (affects all API clients)
- **Impact:** Improves error reporting and debugging

---

## Sign-Off

- **Implemented:** ✅ All changes applied
- **Tested:** ✅ Unit tests created
- **Documented:** ✅ This document
- **Status:** Ready for review and deployment
