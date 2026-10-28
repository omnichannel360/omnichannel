# Bug Assessment: Middleware user-context headers read as null in tests

- **Slug**: middleware-user-headers-test
- **Created**: 2026-10-28
- **Source**: pasted text (failing Jest run on branch `fix/dashboard-test-suite`)
- **Verdict**: invalid (not an app bug — test inspects the wrong headers)
- **Severity**: low (test-only)

## Report (verbatim or summarized)

`dashboard/middleware.test.ts` — "should attach user context to headers with valid token" fails for all 7 protected routes:
`Expected: "user-123"  Received: null` at `response.headers.get('x-user-id')`.
Same failure in `dashboard/lib/middleware.test.ts:81`.

## Symptom

Tests expect `x-user-id`, `x-user-email`, `x-user-role` and `x-auth-verified` on the **middleware response**. They are null.

## Reproduction

1. `cd dashboard && npx jest middleware.test.ts`
2. Observe 7 failures in the "attach user context" case (plus 1 in `lib/middleware.test.ts`).

## Suspected Code Paths

- `dashboard/middleware.ts` — the auth-context block near the end of `middleware()` builds `requestHeaders` and returns `NextResponse.next({ request: { headers: requestHeaders } })`.
- `dashboard/middleware.test.ts:100-116` and `dashboard/lib/middleware.test.ts:~81` — read `response.headers.get('x-user-id')`.

## Root Cause Hypothesis

Confidence: high. `NextResponse.next({ request: { headers } })` overrides the headers of the **forwarded request**. It does not set response headers. Next.js encodes the override on the response as `x-middleware-override-headers` plus `x-middleware-request-<name>`, and the runtime applies them before the route handler runs. A plain `x-user-id` therefore never appears on the middleware response. This is correct production behavior: route handlers receive the headers.

## Proposed Remediation

**Preferred**: Fix the tests. Assert `response.headers.get('x-middleware-request-x-user-id')` (and the same for email, role and auth-verified). No change to `middleware.ts`.

**Alternative**: Also copy the headers onto the response. Rejected: this leaks user identity to the client and duplicates state.

**Files likely to change**:
- `dashboard/middleware.test.ts`
- `dashboard/lib/middleware.test.ts`

**Tests to add or update**:
- The "attach user context" case asserts the `x-middleware-request-*` forwarding headers.

## Risks & Considerations

- `x-middleware-request-*` is a Next.js internal convention, so a Next major upgrade could change it. Acceptable for unit tests.

## Open Questions

- None.
