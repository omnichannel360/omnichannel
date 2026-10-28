# Bug Assessment: a write to a corrupted JSON data file silently replaces the whole dataset

- **Slug**: atomic-corrupt-file-overwrite
- **Created**: 2026-10-28
- **Source**: pasted text (follow-up #1 from the dashboard test-suite cleanup; reported by the meetings/alerts review)
- **Verdict**: valid (reproduced)
- **Severity**: high. Every record in the file is permanently lost and no backup is kept. This affects alerts, kanban, meetings logs and conductor logs. It is triggered by any corruption (a hand edit, a sync conflict, a disk fault, an older non-atomic write) followed by one ordinary write.

## Report

> `lib/atomic-file-ops.ts` atomicUpdate / atomicConditionalUpdate / atomicReadModifyWrite return the fallback when the target JSON is invalid (readJsonFile logs the corruption, then returns the fallback). So the next write to a corrupted alerts.json / meetings-log.json silently replaces the whole dataset with [newItem]. The conductor route does the same: loadLogs returns [] on a parse error, then saveLogs overwrites the file.

## Symptom

When the target file has invalid JSON, a create/update/delete request logs a `warn` and then writes the fallback plus the change. For example, `[{"id":"new"}]` replaces every existing record. The request returns success. What should happen: the write is refused, the corrupted bytes are preserved for recovery, and the API reports a server error.

## Reproduction

Performed 2026-10-28 with a scratch Jest test against the real module (`lib/atomic-file-ops.ts`; the test is not committed):

1. Write `alerts.json` containing 3 records `[{id:a1},{id:a2},{id:a3}]`, with the last 5 characters cut off (torn tail).
2. Call `atomicUpdate(file, items => [...items, {id:'new'}], [])`.
3. Observed: a `warn` log line "File corruption detected - invalid JSON content", the call resolves, and the file now contains `[{"id":"new"}]`. All 3 original records are gone.

The same happens through the HTTP routes, because each write path passes a fallback (see below). The conductor path was confirmed by reading the code (`loadLogs` returns `[]` on a parse error, then `saveLogs` writes the array plus the new entry).

## Suspected Code Paths

- `dashboard/lib/atomic-file-ops.ts:46-65` `readJsonFile`: on a parse error with a fallback, it returns the fallback. Reads and writes share this behaviour.
- `dashboard/lib/atomic-file-ops.ts` `atomicUpdate`, `atomicConditionalUpdate`, `atomicReadModifyWrite`: each feeds the fallback into the transform and then writes the result.
- Affected write callers:
  - `app/api/alerts/route.ts:124` (POST) and `:203` (PATCH), with fallback `[]`.
  - `app/api/kanban/route.ts:129` (POST), `:215` (PATCH) and `:320` (DELETE), with fallback `DEFAULT_TASKS`. A corrupted board is replaced by the seed tasks plus the change.
  - `app/api/meetings/route.ts:250` (POST), with fallback `[]`.
- `dashboard/app/api/conductor/route.ts:62-93` `loadLogs`/`saveLogs`: a hand-rolled copy of the same pattern. It returns `[]` on a parse error or any read error, then `fs.writeFile` writes directly to the target (not crash-safe). Load and save also take separate locks, so two concurrent POSTs lose an update (follow-up #2, same root cause).
- Read-only callers (`atomicRead` with a fallback in alerts GET, metrics, meetings) do not lose data. They only mask the corruption by showing an empty list.

## Root Cause Hypothesis

`readJsonFile` treats "file missing" (ENOENT, where using the fallback is correct, e.g. first run) and "file present but unparseable" (where using the fallback is destructive) the same way. That is safe for reads and destructive for read-modify-write. The crash-safe write fix (f29cd53) stops new partial writes, but it does not protect a file that is already corrupted. Conductor never moved to the shared helper. Confidence: high (reproduced).

## Proposed Remediation

**Preferred: fail closed on writes, keep reads lenient, preserve evidence.**

1. In `lib/atomic-file-ops.ts`, add an exported `CorruptDataFileError` (with `filePath`). The read-modify-write helpers (`atomicUpdate`, `atomicConditionalUpdate`, `atomicReadModifyWrite`) and `atomicTransaction` read through a mode in which a parse error **throws `CorruptDataFileError`** instead of returning the fallback. ENOENT still returns the fallback, so seeding on first run is unchanged. No write happens, so the corrupted bytes stay on disk for recovery. Before throwing, make a one-time best-effort copy of the corrupted file to `.<name>.corrupt-<timestamp>.json` in the same directory, and log it at `error` with the path. That way a later manual "fix" by an operator cannot destroy the evidence either.
2. `atomicRead` keeps returning the fallback on a parse error (reads never destroy data, and the dashboard degrades gracefully). Its corruption log is raised from `warn` to `error` so the problem is visible.
3. Make sure the error maps to **HTTP 500** with a clear, non-leaky message, e.g. "Stored data could not be read; the write was refused to protect existing records." The message must not contain the words `invalid`, `validation`, `not found` or `ENOENT`, because the case-insensitive status matchers in `lib/error-handling.ts` / `lib/error-handler.ts` would otherwise map it to 400 or 404.
4. Move conductor `loadLogs`/`saveLogs` onto `atomicUpdate` (append inside the transform) and `atomicRead` (for GET). That inherits fail-closed behaviour, crash-safe temp+rename writes and a single lock per read-modify-write, which also fixes the lost-update race (#2).

**Alternatives considered**:
- *Quarantine and continue*: rename the corrupted file to `.corrupt-<ts>` and proceed with the fallback. The service stays available and the bytes can be recovered, but users silently see an empty dataset and keep adding to a new file. Recovery then means a manual merge. Rejected as the default: preserving evidence while hiding the loss is still a silent loss from the user's point of view.
- *Auto-repair* (e.g. truncate to the last valid array element): too clever and can still drop records. Rejected.
- *Only fix the call sites* (stop passing fallbacks): this breaks first-run seeding (ENOENT) and leaves the trap in the helper for future callers. Rejected.

**Files likely to change**:
- `dashboard/lib/atomic-file-ops.ts`
- `dashboard/app/api/conductor/route.ts`
- possibly `dashboard/lib/error-handling.ts` (only if `CorruptDataFileError` needs an explicit 500 mapping)
- tests: `dashboard/__tests__/lib/atomic-file-ops.test.ts`, a conductor route test, and an alerts or kanban route test

**Tests to add or update**:
- `atomicUpdate` / `atomicConditionalUpdate` / `atomicReadModifyWrite` / `atomicTransaction` on a corrupted file reject with `CorruptDataFileError`, leave the target byte-identical, and create exactly one `.corrupt-*` copy.
- The same helpers on a missing file still use the fallback (seeding unchanged).
- `atomicRead` with a fallback on a corrupted file still returns the fallback and does not modify the file.
- Route level:
  - alerts POST against a corrupted `alerts.json` returns 500 and leaves the file unchanged;
  - kanban POST against a corrupted file returns 500 and does not reseed;
  - conductor POST against a corrupted log returns 500 and leaves the file unchanged;
  - N concurrent conductor POSTs leave N entries.
- Existing tests that encode the old "fallback on corrupt write" behaviour must be updated to the new contract, not deleted.

## Risks & Considerations

- **Availability trade-off**: once a file is corrupted, writes to that resource fail (500) until an operator restores it from the `.corrupt-*` copy or fixes it. This is intended. The logs name the file and the backup path.
- **Backup copies are new files in the data directories**: dotfile-prefixed, written once per corruption event (skipped if a copy with identical content already exists). Check that no directory listing (e.g. brain file scans) picks them up.
- **Status mapping**: shared error helpers match on message text. Choose the message carefully (see remediation step 3) and test the actual status code.
- **Conductor GET** currently returns `[]` on any read error, including permission errors. With `atomicRead` + fallback, ENOENT and corruption still return `[]`, while other I/O errors now surface as 500. That is a behaviour change, and the correct one.
- No migration or dependency change. The public helper signatures are unchanged; only the error behaviour on corruption changes.

## Open Questions

- None blocking. Fail-closed is chosen over quarantine-and-continue because the operator's standing priority is no silent data loss.
