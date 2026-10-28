# Bug Verification: `middleware.ts` uses the file convention deprecated in Next.js 16

- **Slug**: middleware-proxy-rename
- **Tested**: 2026-10-28
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The deprecation warning no longer appears, and a running production server still enforces auth
through `proxy.ts`. No regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `npx next build` | pass | no "middleware file convention is deprecated" line |
| Proxy active at runtime | `next start` + curl probes | pass | protected 401, public 200, page → /login, spoofed headers 401 |
| Updated tests | `npx jest` (auth-hardening, proxy.test, auth suites) | pass | part of full run |
| Regression suite | `npx jest` | pass | 2979 passed / 42 skipped / 0 failed |
| Type-check | `npx tsc --noEmit -p tsconfig.build.json` | pass | exit 0 |

## Output Excerpts

```
✓ Compiled successfully in 7.5s
ƒ Proxy (Middleware)
/api/metrics -> 401   /api/%61lerts -> 401   / -> 307 /login
Tests:       42 skipped, 2979 passed, 3021 total
```

## Residual Risks

- Authenticated success path not probed live (needs the real `JWT_SECRET`, which is not read);
  covered by the 24 auth-hardening tests and other auth suites.

## Recommendation

Close — verified end-to-end.
