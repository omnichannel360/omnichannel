# Bug Fix: Timed-out lock waiter leaves the file lock stuck forever

- **Slug**: file-lock-timeout-deadlock
- **Fixed**: 2026-10-28
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Release/hand-off logic is extracted into `releaseLock(filePath)` and called on every exit path, including timed-out waiters. Queued waiters now get their own wait timer, so the acquisition timeout fires while they wait. Both timers are cleared.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `dashboard/lib/file-lock.ts` | modified | `releaseLock()` helper; per-waiter `waitTimer`; `clearTimeout` for wait and execution timers; a settled waiter passes the lock on when dequeued |

## Tests Added or Updated

- No new tests; the 3 RED tests from commit c5743ab now pass:
  - `lib/file-lock.test.ts` timeout within the specified time
  - `lib/file-lock.test.ts` recovery after timeout (`getLockCount() === 0`)
  - `__tests__/lib/atomic-file-ops.test.ts` timeout waiting for the lock

## Local Verification

- `npx jest --runTestsByPath lib/file-lock.test.ts __tests__/lib/atomic-file-ops.test.ts __tests__/api/race-conditions.test.ts lib/file-lock-verification.test.ts` → 53/53, run twice.

## Deviations from Assessment

- None.

## Follow-ups

- (MEDIUM, pre-existing) On *execution* timeout the lock is released while the timed-out callback may still be writing, which breaks mutual exclusion. Fix: keep the lock until the callback settles and only reject the caller early.
- (LOW, pre-existing) `clearAllLocks()` mid-flight: `releaseLock` looks the lock up by path and can disturb a newer lock. Fix: compare the captured lock identity.
- (LOW) Long runs of expired waiters recurse synchronously; `queueMicrotask` would harden this.
- `atomicTransaction` re-locks the same path inside a held lock (not re-entrant), so it is a likely 30s hang.
- `atomic*` writes use `fs.writeFile` directly (no temp file + rename), so they are not crash-atomic.
- An occasional "worker failed to exit" warning persists; another open handle remains.
