# Bug Fix: atomic* JSON writes are not crash-safe; atomicTransaction self-deadlocks

- **Slug**: atomic-writes-not-crash-safe
- **Fixed**: 2026-10-28
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Every writer in `lib/atomic-file-ops.ts` now goes through a private `writeJsonFile()`. It writes `.<name>.<pid>.<uuid>.tmp` in the same directory, then renames it over the target, with a bounded retry on transient Windows EPERM/EBUSY/EACCES. The temp file is removed on failure. `atomicTransaction` reads and writes through unlocked helpers inside the lock it already holds, so it no longer re-acquires its own lock. Four duplicated read/parse/write blocks collapse into `readJsonFile` and `writeJsonFile`. Public signatures are unchanged.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `dashboard/lib/atomic-file-ops.ts` | modified | `readJsonFile`, `writeJsonFile`, `renameWithRetry` (3 attempts, 20/40 ms backoff); `atomicTransaction` docstring corrected (earlier writes are not rolled back) |
| `dashboard/__tests__/lib/atomic-file-ops.test.ts` | added tests | crash atomicity (×2 writers), rename retry, rename failure cleanup |

## Tests Added or Updated

- `atomicWrite` / `atomicUpdate` leave the previous file intact when the write fails midway: RED (target truncated) → GREEN
- the 3 existing `Atomic Transaction` tests in `lib/atomic-file-ops.test.ts`: RED (10s timeout, lock re-entry) → GREEN
- a transient EPERM on rename is retried and the write completes
- a rename that keeps failing keeps the original file and leaves no temp file

## Local Verification

- `npx jest --runTestsByPath __tests__/lib/atomic-file-ops.test.ts lib/atomic-file-ops.test.ts` → 40/40.
- Lock and race suites (8 files): the remaining 10 failures are all in `__tests__/race-conditions.test.ts` and `__tests__/api/integration-race-conditions.test.ts`, and all 10 failed before this change (0 newly failing).
- Independent review (`ecc:code-reviewer`): approve. Its MEDIUM (Windows rename retry) is applied here.

## Deviations from Assessment

- Added `renameWithRetry`, which the review requested. Otherwise none.

## Follow-ups

- (LOW) A hard kill between `writeFile` and `rename` can leave a stale `.*.tmp`. Nothing sweeps them up, and `lib/atomic-dir-ops.ts` `atomicFileCount` does not filter them (no app caller today).
- (LOW) No fsync, so durability across a power loss is not guaranteed.
- (Pre-existing) On an execution timeout, `file-lock` still releases the lock while the callback may be running.
