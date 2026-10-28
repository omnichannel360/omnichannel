# Bug Verification: Lowercase "bearer" auth scheme rejected

- **Slug**: bearer-scheme-case
- **Tested**: 2026-10-28
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

A lowercase scheme with a valid token authenticates. Malformed headers, expired tokens and trailing data are still rejected. The full suite shows no regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `bearer <validToken>` via `verifyAuth` | pass | authenticated |
| Auth suites (7 files) | `npx jest --runTestsByPath …` | pass 218/218 | malformed-header rejections intact |
| ReDoS probe | 1,000,000 spaces + "a b" against the regex | 1.8 ms | linear (reviewer-measured) |
| Regression suite | `npx jest --json` (full) | pass (0 newly failing) | |
| Independent review | `ecc:security-reviewer` | approve | no bypass; cookie fallback nuance noted |

## Residual Risks

- Cookie-fallback behavior for malformed headers (see fix.md follow-ups).

## Recommendation

Close the bug.
