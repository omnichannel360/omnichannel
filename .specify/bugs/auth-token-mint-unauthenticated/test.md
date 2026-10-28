# Bug Verification: POST /api/auth mints admin JWTs without credentials

- **Slug**: auth-token-mint-unauthenticated
- **Tested**: 2026-10-28
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Anonymous, invalid, refresh-token and non-admin callers no longer receive tokens. An admin caller still does. The full suite shows no regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | route-level test: anonymous POST with `role:"admin"` | pass | 401 with no token; was 200 with tokens before the fix |
| New tests | `npx jest --runTestsByPath app/api/__tests__/auth-token-route.test.ts` | pass 5/5 | |
| Regression suite | `npx jest --json` (full) | pass (0 newly failing) | 188 → 185 failed overall |
| Type-check | `npx tsc --noEmit` filtered to the route | pass | only the pre-existing error remains |
| Independent review | `ecc:security-reviewer` | approve | MEDIUM follow-ups listed in fix.md |

## Residual Risks

- Not exercised against a running deployment. Verified at the route-handler level with real JWT signing and verification.
- Tokens minted before this fix stay valid until `JWT_SECRET` is rotated.

## Recommendation

Close the bug. Rotate `JWT_SECRET` if the dashboard was ever reachable beyond localhost.
