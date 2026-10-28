# Bug Assessment: Valid meetings POST returns 400 in tests

- **Slug**: meetings-post-400-test
- **Created**: 2026-10-28
- **Source**: pasted text (failing Jest run on branch `fix/dashboard-test-suite`)
- **Verdict**: invalid (test bug); the rejection tests in the same file pass for the wrong reason
- **Severity**: medium (test suite gives false security assurance; app is correct)

## Report (verbatim or summarized)

`dashboard/__tests__/api/meetings.test.ts` — 7 failures:
- 3× "accepts valid meeting_type" → `Expected: 200, Received: 400`
- 2× `safeJoin` expected to throw on traversal
- 1× `safeJoin` result expected to contain the POSIX path `/data/meetings` (it fails on Windows)
- 1× GET → `Expected: 200, Received: 429`

## Symptom

POST with `{message, meeting_type: 'planning_meeting_2025'}` returns 400. GET returns 429.

## Reproduction

1. `cd dashboard && npx jest __tests__/api/meetings.test.ts`

## Suspected Code Paths

- `dashboard/lib/validation/middleware.ts` `validateHeaders()`: returns 400 when `Content-Type` is missing or is not `application/json`. The test builds `new NextRequest(url, { method: 'POST', body: JSON.stringify(...) })` without headers. Fetch sets `text/plain;charset=UTF-8` for string bodies, so the check fails **before** schema validation.
- `dashboard/app/api/meetings/route.ts` POST: validates with `MeetingRequestSchema` from `lib/validation.ts`, which is `{message?, meeting_type?: MeetingTypeSchema, participants?}`. The test payloads match it.
- `dashboard/lib/validation.ts` `safeJoin`: the live version uses `path.basename`. It contains paths instead of throwing.
- GET 429: `applyRateLimit(request, 'meetings')` shares an in-memory store across tests in the file.

## Root Cause Hypothesis

Confidence: high. A missing JSON content type in test requests causes the 400. Consequently every "rejects meeting_type …" test in this file gets 400 from the header check, **not** from `MeetingTypeSchema`. Those tests are vacuous. The `safeJoin` and 429 failures are stale expectations and test isolation issues.

## Proposed Remediation

**Preferred**: Fix the test file only.
1. Add a `jsonPost(body)` helper that sets `content-type: application/json`, and use it everywhere, so rejection tests exercise the schema.
2. Mock `@/lib/api-rate-limit-middleware` (`applyRateLimit` → `null`) to isolate the route logic.
3. Change the `safeJoin` cases to containment assertions (`path.dirname(result) === path.resolve(base)`).
4. Mock filesystem writes (`atomic-file-ops`) so accepted POSTs don't touch real `company-brain/` data.

**Files likely to change**:
- `dashboard/__tests__/api/meetings.test.ts`

**Tests to add or update**:
- Rejection tests return 400 because of validation, not Content-Type.
- Accepted POSTs return 200.

## Risks & Considerations

- Accepted POSTs write into `../company-brain/meetings` unless `atomic-file-ops` is mocked. Mocking is mandatory.

## Open Questions

- None.
