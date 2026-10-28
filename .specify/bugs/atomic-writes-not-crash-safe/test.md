# Bug Verification: atomic* JSON writes are not crash-safe; atomicTransaction self-deadlocks

- **Slug**: atomic-writes-not-crash-safe
- **Tested**: 2026-10-28
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

A write that fails midway now leaves the previous file intact with no temp files left behind. `atomicTransaction` completes instead of timing out on its own lock. The full suite shows no regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `fs.writeFile` spy writes half the bytes, then throws ENOSPC | pass | original file byte-identical; directory contains only the target |
| Transaction deadlock | 3 `Atomic Transaction` tests in `lib/atomic-file-ops.test.ts` | pass | timed out at 10s before the fix |
| Atomic suites | `npx jest --runTestsByPath __tests__/lib/atomic-file-ops.test.ts lib/atomic-file-ops.test.ts` | pass 40/40 | |
| Lock and race suites (8 files) | `npx jest --runTestsByPath …` | 10 failing, all failed before | 0 newly failing |
| Regression suite | `npx jest --json` (full) | pass (0 newly failing) | data dirs (`dashboard/data`, `company-brain`) clean |
| Independent review | `ecc:code-reviewer` | approve | rename retry applied |

## Residual Risks

- No fsync, so durability across a power loss is not guaranteed.
- A crash between `writeFile` and `rename` can leave a stale `.tmp` file (harmless; the target stays intact).

## Recommendation

Close the bug.
