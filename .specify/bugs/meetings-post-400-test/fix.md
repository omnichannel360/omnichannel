# Bug Fix: Valid meetings POST returns 400 in tests

- **Slug**: meetings-post-400-test
- **Fixed**: 2026-10-28
- **Assessment**: ./assessment.md
- **Status**: applied (test-only; assessment verdict was `invalid` for the app — no app code changed)

## Summary

POST requests in the test now send `content-type: application/json`, so they reach schema validation. Rejection tests also assert the 400 is **not** a Content-Type error, which proves `MeetingTypeSchema` did the rejecting. File writes and rate limiting are mocked. `safeJoin` cases assert containment.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `dashboard/__tests__/api/meetings.test.ts` | modified | +JSON content-type on 11 POSTs; +`not.toMatch(/content-type/i)` on 8 rejection asserts |
| same | modified | mocks `@/lib/atomic-file-ops` (no writes to `data/` or `company-brain/`) and `@/lib/api-rate-limit-middleware` |
| same | modified | 3 `safeJoin` cases: throw/POSIX-path assertions → `path.dirname(result) === path.resolve(base)` |

## Tests Added or Updated

- `meeting_type whitelist validation › rejects …` (×8) — now genuinely exercise the schema.
- `accepts valid meeting_type: alphanumeric / hyphens / underscores` — 200.
- `safeJoin() containment check` and `no single layer bypass allows escape` — containment, platform-independent.
- `GET /api/meetings - Security` — 200 (no rate-limit bleed).

## Local Verification

- `npx jest --runTestsByPath __tests__/api/meetings.test.ts` → pass (part of the 178/178 run).
- `git status -- dashboard/data company-brain` → no changes (mocks held).

## Deviations from Assessment

- None.

## Follow-ups

- Other suites building `new NextRequest(..., { method: 'POST', body })` without a JSON content type are likely vacuous in the same way. Audit them during the broader stale-test pass.
