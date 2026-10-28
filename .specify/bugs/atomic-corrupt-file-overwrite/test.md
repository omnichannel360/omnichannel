# Bug Verification: a write to a corrupted JSON data file silently replaces the whole dataset

- **Slug**: atomic-corrupt-file-overwrite
- **Tested**: 2026-10-28
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The original reproduction no longer loses data. The write is refused with `CorruptDataFileError`, the corrupted file stays byte-identical, and one backup copy is kept. The new regression tests fail on the pre-fix code and pass with the fix. The full suite and type-check show no regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Scratch Jest test from the assessment: a torn 3-record `alerts.json`, then `atomicUpdate(file, add 'new', [])` | pass | Rejected; file unchanged; `.alerts.json.corrupt-<hash>.json` created. Before the fix the file became `[{"id":"new"}]` |
| New tests, GREEN | `npx jest --runTestsByPath __tests__/lib/atomic-file-ops.test.ts __tests__/api/corrupt-data-file-routes.test.ts` | pass | 42/42 |
| New tests, RED on pre-fix source | Same command with `git show HEAD:` copies of `lib/atomic-file-ops.ts` and `app/api/conductor/route.ts` | pass (as expected, fails) | 16 failed / 26 passed; fix restored afterwards (diff stat re-checked) |
| Route-level behaviour | `corrupt-data-file-routes.test.ts` | pass | alerts/kanban/conductor/meetings POST and kanban PUT/DELETE return 500 and leave the file intact; meetings writes no brain record; conductor never dispatches to GitHub; GET stays lenient; 10 concurrent conductor POSTs leave 10 entries |
| Related suites | Every test file referencing atomic-file-ops / alerts / kanban / meetings / conductor (33 files) | pass | 31 passed, 2 skipped (pre-existing), 725 tests passed |
| Full regression suite | `npx jest --json --forceExit` | pass | 0 failed / 2942 passed / 42 skipped, 109/109 suites |
| Data-dir hygiene | `git status --short -- data` plus a listing of `company-brain/meetings` before and after the full run | pass | No new files in the final run (one stray record from an earlier intermediate run, see Residual Risks) |
| Type-check | `npx tsc --noEmit -p .` | pass | 551 errors, unchanged from baseline; none in the changed source or the new test file |
| Independent review | `ecc:code-reviewer` | pass | APPROVE, 0 critical / 0 high; MEDIUM #1-3 and LOW #4 applied |

## Output Excerpts

```
OUTCOME: REJECTED CorruptDataFileError: Stored data could not be read; the write was refused to protect existing records
FILE UNCHANGED: true
DIR: .alerts.json.corrupt-b066244814b28a01.json, alerts.json
```

```
pre-fix source:  Tests: 16 failed, 26 passed, 42 total
fixed source:    Tests: 42 passed, 42 total
full suite:      failed 0 passed 2942 suites 0/109
```

## Residual Risks

- **Availability:** once a file is corrupted, writes to that resource return 500 until an operator restores it from the `.corrupt-*` copy. This is intended. The error log names both paths.
- **Conductor check timing:** the check before dispatch is best-effort. A disk-full or permission failure after the GitHub issue is created still returns 500 (fix.md follow-up).
- **Backups:** not rotated. Each distinct corruption adds one dotfile in `dashboard/data`.
- **Stray record:** an intermediate full-suite run left one untracked synthetic record in `company-brain/meetings` (`standup_unknown_meeting_c18e1565-….json`, 01:07Z). The source suite was not pinned down. The final run left no files, and the meetings regression test now mocks `cwd` for the whole request, so it would fail if a refused POST reached `logToBrain`.
- **Production check:** verified against real files in temp directories, not against production data files.

## Recommendation

Close the bug: verified end-to-end. The original reproduction is fixed, the regression tests prove the change, and no regressions were found. Track the fix.md follow-ups (a durable pending log entry for conductor, backup rotation, kanban GET status codes) separately.
