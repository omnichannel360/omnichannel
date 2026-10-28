# Bug Assessment: Timed-out lock waiter leaves the file lock stuck forever

- **Slug**: file-lock-timeout-deadlock
- **Created**: 2026-10-28
- **Source**: pasted text (failing Jest tests exposed by the stale-test rewrite, commit c5743ab)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

Three tests fail against `lib/file-lock.ts`:
- `lib/file-lock.test.ts` "should timeout if lock cannot be acquired within specified time": the waiter is still pending at 2× its timeout.
- `lib/file-lock.test.ts` "should recover from timeout and allow subsequent acquisition": `getLockCount()` is 1 after everything settled (expected 0).
- `__tests__/lib/atomic-file-ops.test.ts` "should timeout waiting for lock": "Test timeout" instead of "Lock acquisition timeout".

## Symptom

1. The acquisition timeout is checked only when a waiter reaches the head of the queue, so a waiter can wait indefinitely behind a slow holder.
2. When a waiter is dequeued after its timeout, `executeCallback` rejects and `return`s **before** the `try/finally` that hands the lock to the next waiter or releases it. The lock stays `locked: true` with its queue stranded. Every later caller for that path hangs for the life of the process.
3. The per-execution `setTimeout` is never cleared, so timers leak (Jest warns that a worker failed to exit).

## Reproduction

1. Hold `withFileLock(p, …)` longer than a second caller's `timeoutMs`.
2. Second caller: no rejection until the holder finishes; then it rejects, but the lock is never released.
3. Third caller on `p`: hangs forever.

## Suspected Code Paths

- `dashboard/lib/file-lock.ts:30-41`: early `return` on `remainingMs <= 0` skips release.
- `dashboard/lib/file-lock.ts:45-51`: the `setTimeout` in `timeoutPromise` is never cleared.
- `dashboard/lib/file-lock.ts:93-95`: a queued waiter has no timer of its own.

## Root Cause Hypothesis

Confidence: high (confirmed by reading the code). The release logic lives only in the `finally` of the happy path, and timeout enforcement is lazy.

## Proposed Remediation

**Preferred**: Extract the release/hand-off into a `releaseLock(filePath)` helper, called from both the normal `finally` and the timed-out path. Give each queued waiter a wait timer that rejects at `timeoutMs`. A waiter that already settled, when dequeued, hands the lock on immediately without running its callback, which keeps FIFO order without splicing the queue. Clear both timers.

**Files likely to change**:
- `dashboard/lib/file-lock.ts`

**Tests to add or update**:
- Existing 3 failing tests (already written; RED).

## Risks & Considerations

- 26 call sites use `withFileLock`/`withLock` (alerts, kanban, meetings, profiles, atomic-file-ops). The public signature is unchanged.
- A waiter that times out while queued no longer runs its callback later (previously it never ran either), so behavior is unchanged except that the lock is now released.
- `atomicTransaction` nested-lock deadlock (same path re-locked) is a separate issue and out of scope; it is noted as a follow-up.

## Open Questions

- None.
