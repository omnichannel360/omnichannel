# Bug Fix: a write to a corrupted JSON data file silently replaces the whole dataset

- **Slug**: atomic-corrupt-file-overwrite
- **Fixed**: 2026-10-28
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Read-modify-write helpers now **refuse** to write over a data file that exists but cannot be parsed, or that parses to the wrong shape (a non-array where the fallback is an array). They back up the bytes to `.<name>.corrupt-<sha256-16>.json` (mode 0600) and throw `CorruptDataFileError`, which the routes return as HTTP 500. Two behaviours are unchanged: a missing file still seeds from the fallback, and `atomicRead` still returns the fallback without touching the file. Conductor now uses the shared helpers instead of its own load/save, which also fixes its lost-update race. It also checks the log before dispatching to GitHub, so a refused write cannot leave behind duplicate issues.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `dashboard/lib/atomic-file-ops.ts` | modified | New `CorruptDataFileError` (filePath, backupPath, cause); `backupCorruptFile` (content-hash name, `wx`, 0600, best effort); `readJsonFile` gains `onCorrupt: 'fallback' \| 'refuse'`; `atomicUpdate` / `atomicConditionalUpdate` / `atomicReadModifyWrite` / `atomicTransaction` use `'refuse'`; corruption log raised from warn to error |
| `dashboard/app/api/conductor/route.ts` | modified | `loadLogs` → `atomicRead(LOG_FILE, [])`; `saveLogs`+push → `appendLog` via `atomicUpdate`; new `assertLogWritable()` called before `dispatchToGitHub`; drops `withFileLock`/`ensureDataDir` imports |
| `dashboard/__tests__/lib/atomic-file-ops.test.ts` | added tests | New describe "atomic-file-ops corrupted target file" (9 cases) |
| `dashboard/__tests__/api/corrupt-data-file-routes.test.ts` | added | Route-level regression suite (10 cases) |

## Diff Highlights

```ts
// readJsonFile, write ('refuse') policy
const parsed: unknown = JSON.parse(content)
if (onCorrupt === 'refuse' && Array.isArray(fallback) && !Array.isArray(parsed)) {
  throw new TypeError(`Expected a JSON array, found ...`)
}
// catch: back up, log at error, throw CorruptDataFileError (never the fallback)
```

```ts
// conductor POST
await assertLogWritable()            // read-only check with the write path's corruption policy
const dispatch = await dispatchToGitHub(message, requester)
...
await appendLog({ ... })             // one lock for read + append, crash-safe write
```

## Tests Added or Updated

`__tests__/lib/atomic-file-ops.test.ts › atomic-file-ops corrupted target file`:
- `atomicUpdate` / `atomicConditionalUpdate` / `atomicReadModifyWrite` / `atomicTransaction` each refuse the write and leave the corrupted file byte-identical, with exactly one backup holding the same bytes (×4).
- The error carries `filePath` and `backupPath`, and its message contains no 4xx trigger words.
- Hitting the same corruption repeatedly keeps a single backup.
- Valid JSON of the wrong shape (`{}` where a list is expected) is refused.
- A missing file still seeds from the fallback.
- `atomicRead` still returns the fallback and never touches the file or creates a backup.

`__tests__/api/corrupt-data-file-routes.test.ts`:
- POST to alerts, kanban and conductor each returns 500, leaves the file byte-identical and makes one backup (×3).
- Kanban PUT and DELETE return 500 without reseeding or rewriting (×2).
- Meetings POST returns 500, keeps the log, and writes no brain record (`cwd` is mocked for the whole request so the brain-folder check is meaningful).
- Kanban POST refuses a well-formed but non-array file instead of replacing it with `DEFAULT_TASKS`.
- Conductor refuses before `dispatchToGitHub` is called.
- Conductor GET reads a corrupted log as `[]` and leaves it untouched.
- 10 concurrent conductor POSTs leave 10 distinct entries (lost-update race).

RED → GREEN: against the pre-fix source (`git show HEAD:` copies of both source files), the two new suites gave **16 failed / 26 passed**. With the fix they give **42/42**. The 2 new cases that pass on both are the unchanged-behaviour guards (missing-file seeding, lenient `atomicRead`).

## Local Verification

- Reproduced before the fix: a scratch Jest test against `atomicUpdate` turned a torn 3-record `alerts.json` into `[{"id":"new"}]`.
- `npx jest --runTestsByPath __tests__/lib/atomic-file-ops.test.ts __tests__/api/corrupt-data-file-routes.test.ts`: 42/42 passed.
- The 32 existing suites that touch atomic-file-ops / alerts / kanban / meetings / conductor: 30 passed, 2 skipped (pre-existing skips), 0 failed. No existing test depended on the old overwrite behaviour.
- Full suite (`npx jest --forceExit`): **0 failed / 2942 passed / 42 skipped, 109/109 suites**. `git status -- data` is clean and `company-brain/meetings` is unchanged across the final run.
- `tsc --noEmit`: 551 errors, the same as before. None are in the changed source files or the new test file.
- Independent review (`ecc:code-reviewer`): APPROVE, 0 CRITICAL / 0 HIGH. MEDIUM #1 (non-array JSON), #2 (missing meetings / kanban PUT / DELETE tests) and #3 (backup permissions) were applied, plus LOW #4 (longer hash).

## Deviations from Assessment

- **Backup name:** uses a content hash (`.corrupt-<sha256-16>.json`) instead of a timestamp. This gives the "one copy per corruption event" property the assessment asked for without a separate de-duplication step. Mode is 0600.
- **Wrong-shape JSON is refused too** (array fallback, non-array content). The review showed that `{}` in `kanban.json` would otherwise be replaced by `DEFAULT_TASKS`, which is the same data-loss class.
- **Conductor `assertLogWritable()` check before GitHub dispatch:** not in the assessment. Without it, fail-closed writes would turn every retry against a corrupted log into a duplicate GitHub issue.
- `lib/error-handling.ts` was not changed. The error message was chosen so `handleRouteError` already maps it to 500, and a test pins this.

## Follow-ups

- (MEDIUM) The conductor check is best-effort. A disk-full, permission or rename failure *after* dispatch still returns 500 after the issue was created. A durable fix writes a "pending" log entry before dispatching and updates it afterwards.
- (LOW) Backups are not rotated. Each distinct corruption adds a file (dotfile, `.json` suffix). No current `readdir` scans `dashboard/data`, but a future scan that filters on `.json` should exclude `.*.corrupt-*`.
- (LOW, pre-existing) Kanban GET uses `atomicRead` without a fallback. A corrupted file maps to 400 and a missing file to 404, so `DEFAULT_TASKS` on GET is unreachable.
- (Ops) An untracked file `company-brain/meetings/standup_unknown_meeting_c18e1565-….json`, timestamped 09:07 (01:07Z) on 2026-10-28, appeared during an intermediate full-suite run. The source test was not pinned down: every candidate suite run alone writes nothing, and the final full run wrote nothing. It is a synthetic test record (`status: failed`, no participants) and is safe to delete.
