# Bug Verification: Middleware user-context headers read as null in tests

- **Slug**: middleware-user-headers-test
- **Tested**: 2026-10-28
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The original 11 failures (10 in `middleware.test.ts`, 1 in `lib/middleware.test.ts`) no longer reproduce. A new header-spoofing test passes. The full suite showed no new failures.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `npx jest --runTestsByPath middleware.test.ts lib/middleware.test.ts` | pass | assessment repro step |
| Mechanism probe | `node -e` `NextResponse.next({request:{headers}})` | pass | emits `x-middleware-request-x-user-id` |
| New / updated tests | spoof-overwrite test (×7 routes), no-leak asserts | pass | client `x-user-id: attacker` is replaced by the token's `sub` |
| Regression suite | `npx jest --json` (full dashboard) | pass (no new failures) | 382 → 348 failed overall; 0 newly failing |
| Type-check | `npx tsc --noEmit` | pre-existing errors only | `middleware.test.ts:15` `jwt.sign` overload predates this fix |
| Independent review | `ecc:code-reviewer` agent | approve | 0 CRITICAL / 0 HIGH |

## Output Excerpts

```
PASS ./middleware.test.ts
PASS lib/middleware.test.ts
Tests: 186 passed, 186 total   (4 changed files combined)
```

## Residual Risks

- `x-middleware-request-*` is a Next.js internal; a Next major upgrade could change it.
- The repo has 663 type errors, which predate this fix.

## Recommendation

Close the bug. Verified end-to-end at the unit level. No app change was needed.
