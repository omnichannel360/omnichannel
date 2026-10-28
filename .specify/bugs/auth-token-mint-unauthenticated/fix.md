# Bug Fix: POST /api/auth mints admin JWTs without credentials

- **Slug**: auth-token-mint-unauthenticated
- **Fixed**: 2026-10-28
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`POST /api/auth` now requires an authenticated admin caller: no valid token returns 401, and a non-admin role returns 403. Both checks run before the body is parsed or any token is generated. The operator chose this option ("Require admin") over deleting the route or limiting it to dev.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `dashboard/app/api/auth/route.ts` | modified | `verifyToken(request)` gate after the rate limit; 401 `AUTH_MISSING` / 403 `INSUFFICIENT_PERMISSIONS`; audit log records `issuedBy: caller.sub` |
| `dashboard/app/api/__tests__/auth-token-route.test.ts` | added | 5 cases |

## Tests Added or Updated

- anonymous → 401, no token in the body (was 200 with tokens: RED → GREEN)
- invalid bearer → 401 (RED → GREEN)
- user-role token → 403 (RED → GREEN)
- refresh token as bearer → 401 (it has no `role`, so `isValidTokenPayload` rejects it)
- admin token → 200 with access and refresh tokens

## Local Verification

- `npx jest --runTestsByPath app/api/__tests__/auth-token-route.test.ts` → 5/5.
- `tsc`: no new errors in the route. The one error at the success-path `addRateLimitHeaders` assignment existed before this change (it was line 79 and moved down with the inserted lines).

## Deviations from Assessment

- None.

## Follow-ups

- (MEDIUM) `lib/auth.ts:68`: pass `{ algorithms: ['HS256'] }` to `jwt.verify` explicitly (safe today, but this hardens it against library upgrades).
- (MEDIUM) `middleware.ts`: middleware only checks signature and expiry, so a refresh token (`type:'refresh'`, no role) passes middleware on protected routes. Route handlers that call `verifyToken` still reject it. Reject `type === 'refresh'` in middleware.
- (LOW) `middleware.ts:157`: `startsWith('/api/auth')` makes every future `/api/auth*` path public. Use an exact allowlist instead.
- (LOW) Rate-limit keys on public routes use `X-Forwarded-For`. That is safe on Vercel (the edge overwrites it) but spoofable if the app is self-hosted without a proxy that overwrites the header.
- **Ops:** if the dashboard was reachable beyond localhost before this fix, rotate `JWT_SECRET`.
