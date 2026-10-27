# Bug Assessment: atomic* JSON writes are not crash-safe; atomicTransaction self-deadlocks

- **Slug**: atomic-writes-not-crash-safe
- **Created**: 2026-10-28
- **Source**: follow-up from `.specify/bugs/file-lock-timeout-deadlock/fix.md`
- **Verdict**: valid
- **Severity**: high (data loss on crash or full disk; this module backs alerts, kanban, meetings, brain and metrics)

## Report

Follow-ups recorded in the file-lock fix: "`atomic*` writes use `fs.writeFile` directly (no temp file + rename), so they are not crash-atomic" and "`atomicTransaction` re-locks the same path inside a held lock (not re-entrant), so it is a likely 30s hang."

## Symptom

1. A process crash, kill or ENOSPC during `fs.writeFile(target)` truncates the target JSON file. The next `atomicUpdate` logs "corruption" and **silently replaces the whole dataset with the fallback** (`[]`), so every record is lost.
2. `atomicTransaction(path, cb)` calls `atomicRead`/`atomicWrite` inside `withFileLock(path)`. They try to take the same non-re-entrant lock, wait until the 30s acquisition timeout and reject. Every transaction that reads or writes fails.

## Reproduction

1. Write a valid JSON file, then make `fs.writeFile` write half the bytes and throw ENOSPC. Call `atomicWrite`. The file is now truncated JSON.
2. Call `atomicTransaction(file, async (read) => read())`. It hangs and then rejects with a lock acquisition timeout (the 3 existing tests in `lib/atomic-file-ops.test.ts` time out).

## Suspected Code Paths

- `dashboard/lib/atomic-file-ops.ts:64,113,168,220`: `fs.writeFile(filePath, …)` writes onto the target.
- `dashboard/lib/atomic-file-ops.ts:240,246`: `atomicRead`/`atomicWrite` are called inside a lock that is already held.
- `dashboard/lib/atomic-file-ops.ts:82,132,191`: a parse error falls back to `fallback`, which amplifies a truncated file into total data loss.

## Root Cause Hypothesis

The module name promises atomicity, but it only provides in-process mutual exclusion. Write durability was never implemented, and the transaction helper composed locked primitives without re-entrancy. Confidence: high.

## Proposed Remediation

**Preferred**: add one private `writeJsonFile()` that writes a sibling temp file and then calls `fs.rename` to replace the target (atomic within a directory on POSIX and NTFS), removing the temp file on failure. Add one private `readJsonFile()` that does not lock. Route all writers and `atomicTransaction` through them. Public signatures stay the same.

**Files likely to change**:
- `dashboard/lib/atomic-file-ops.ts`
- `dashboard/__tests__/lib/atomic-file-ops.test.ts`

**Tests to add or update**:
- a write failing midway leaves the previous file byte-identical and no temp file behind (`atomicWrite`, `atomicUpdate`)
- the existing `atomicTransaction` tests in `lib/atomic-file-ops.test.ts` must pass without timing out

## Risks & Considerations

- On Windows, `rename` over a file that another process holds open (an editor or antivirus) can fail with EPERM. The error surfaces, and the target file stays intact.
- No fsync, so durability across a power loss is not guaranteed; only partial writes are prevented.
- Temp files are dotfiles in the data directory; check that no directory listing picks them up.

## Open Questions

- None.
