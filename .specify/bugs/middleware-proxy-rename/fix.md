# Bug Fix: `middleware.ts` uses the file convention deprecated in Next.js 16

- **Slug**: middleware-proxy-rename
- **Fixed**: 2026-10-28
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Renamed `middleware.ts` → `proxy.ts` and its exported function `middleware` → `proxy`, matching
the Next.js 16 convention. Logic and `config.matcher` are unchanged.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `dashboard/middleware.ts` → `dashboard/proxy.ts` | renamed + modified | `export async function proxy`, header comment updated |
| `dashboard/middleware.test.ts` → `dashboard/proxy.test.ts` | renamed + modified | imports `proxy` from `./proxy` |
| `dashboard/lib/middleware.test.ts` | modified | import path `@/proxy` |
| `dashboard/tests/api/auth.test.ts` | modified | import path `@/proxy` |
| `dashboard/tests/auth.middleware.test.ts` | modified | import path `@/proxy` |
| `dashboard/__tests__/api/endpoints.integration.test.ts` | modified | import path `@/proxy` |
| `dashboard/__tests__/auth-hardening.test.ts` | modified | import path `@/proxy` |

## Diff Highlights (optional)

```ts
-export async function middleware(request: NextRequest) {
+export async function proxy(request: NextRequest) {
```

Tests import `{ proxy as middleware }` so their bodies are untouched.

## Tests Added or Updated

- Import paths only; existing suites (incl. 24 auth-hardening tests) now exercise `proxy`.

## Local Verification

- `npx tsc --noEmit -p tsconfig.build.json` → exit 0.
- `npx next build` → compiled, route table shows "ƒ Proxy (Middleware)", deprecation warning gone.
- `next start -p 3917` live probe: `/api/health` 200, `/api/metrics` 401, `/api/%61lerts` 401,
  `/api/alerts/1` 401, `/` 307 → `/login`, spoofed `x-user-*` headers on `/api/metrics` 401.
- `npx jest` → 109 suites passed (2 fully skipped), 2979 passed / 42 skipped / 0 failed.

## Deviations from Assessment

None.

## Follow-ups

- Disabled `middleware-nextauth.ts` keeps its name; it is excluded from the build and not a
  Next.js convention file.
