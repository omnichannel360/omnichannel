# Bug Fix: Lowercase "bearer" auth scheme rejected

- **Slug**: bearer-scheme-case
- **Fixed**: 2026-10-28
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`verifyToken` (`lib/auth.ts`) and `extractToken` (`middleware.ts`) now match `/^Bearer\s+(\S+)$/i`, so the scheme is case-insensitive and exactly one token is required. A trailing extra token is still rejected.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `dashboard/lib/auth.ts` | modified | regex scheme match |
| `dashboard/middleware.ts` | modified | same regex in `extractToken` |
| `dashboard/tests/api/auth.test.ts` | modified | lowercase scheme now expected to authenticate (RFC 7235 §2.1) |

## Tests Added or Updated

- `tests/auth.middleware.test.ts` "should handle case-insensitive Bearer prefix": RED → GREEN.
- `tests/api/auth.test.ts` "should handle case-insensitive Bearer prefix": flipped to acceptance; RED → GREEN.

## Local Verification

- 7 auth suites: `npx jest --runTestsByPath tests/api/auth.test.ts tests/auth.middleware.test.ts middleware.test.ts lib/middleware.test.ts lib/auth.test.ts __tests__/api/endpoints.integration.test.ts lib/auth-middleware.test.ts` → 218/218.

## Deviations from Assessment

- None.

## Follow-ups

- (LOW) A malformed `Authorization` header (e.g. `Bearer a b`) now falls through to the session-cookie check instead of a hard 401. This is not a bypass, since the cookie is a valid credential. For strictness, treat any present-but-unmatched Authorization header as a failure.
- `lib/middleware/rateLimit.ts:32` still uses a case-sensitive prefix to pick the rate-limit key, and keys on the *unverified* token (rate-limit bypass by rotating fake tokens). Track separately.
