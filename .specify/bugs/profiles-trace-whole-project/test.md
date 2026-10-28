# Bug Verification: Profiles route traces the whole project into the server bundle

- **Slug**: profiles-trace-whole-project
- **Tested**: 2026-10-28
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

`next build` no longer reports dynamic filesystem tracing for the profiles route, and the
profiles-related suites and full regression suite pass.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `npx next build` | pass | no "Turbopack build encountered N warnings" block |
| Profiles-related tests | `npx jest profiles security endpoints.integration api-auth-integration` | pass | 361 passed / 27 skipped |
| Regression suite | `npx jest` | pass | 2979 passed / 42 skipped / 0 failed |
| Type-check | `npx tsc --noEmit -p tsconfig.build.json` | pass | exit 0 |

## Output Excerpts

```
✓ Compiled successfully in 7.5s
Tests:       42 skipped, 2979 passed, 3021 total
```

## Residual Risks

- Bundle size reduction not measured; the diagnostic that caused whole-project tracing is gone.

## Recommendation

Close — verified.
