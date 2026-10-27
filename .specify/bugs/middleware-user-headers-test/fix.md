# Bug Fix: Middleware user-context headers read as null in tests

- **Slug**: middleware-user-headers-test
- **Fixed**: 2026-10-28
- **Assessment**: ./assessment.md
- **Status**: applied (test-only; assessment verdict was `invalid` for the app — no app code changed)

## Summary

Tests now assert the `x-middleware-request-*` headers that `NextResponse.next({ request: { headers } })` actually emits. A new assertion confirms identity headers do **not** leak onto the client response. A missing-secret test was fixed to assert fail-closed behavior and restore env state in `finally`.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `dashboard/middleware.test.ts` | modified | "attach user context" (×7 routes) and "extract correct payload" now read `x-middleware-request-*`; added a no-leak assertion |
| `dashboard/middleware.test.ts` | modified | "missing JWT_SECRET" now awaits and expects 401, with env restored in `finally` |
| `dashboard/lib/middleware.test.ts` | modified | same header fix for "attach user info headers" |

## Diff Highlights

```ts
expect(response.headers.get('x-middleware-request-x-user-id')).toBe('user-123')
expect(response.headers.get('x-user-id')).toBeNull() // no client leak
```

## Tests Added or Updated

- `middleware.test.ts › Protected Routes › * › should attach user context to headers with valid token` — pins header forwarding plus no leak.
- `middleware.test.ts › Error Handling › should handle missing JWT_SECRET gracefully` — pins fail-closed 401.

## Local Verification

- Probe: `NextResponse.next({request:{headers}})` emits `x-middleware-override-headers` and `x-middleware-request-x-user-id` (verified via node).
- `npx jest --runTestsByPath middleware.test.ts lib/middleware.test.ts` → all pass (part of the 178/178 run).

## Deviations from Assessment

- Scope expanded within the same file. Two additional failures had related causes: "extract correct payload" had the same header issue. The JWT_SECRET test expected a synchronous throw, but `middleware` is async and catches the error (returns 401). Because the test didn't restore `JWT_SECRET` on failure, it cascaded into "should allow request to continue with valid auth".

## Follow-ups

- None.
