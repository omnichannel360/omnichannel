# Bug Assessment: XSS tests "accept script tag in query param"

- **Slug**: xss-profile-query-test
- **Created**: 2026-10-28
- **Source**: pasted text (failing Jest run on branch `fix/dashboard-test-suite`)
- **Verdict**: invalid as reported (stale tests); one valid low-severity hardening gap
- **Severity**: low

## Report (verbatim or summarized)

`dashboard/app/api/__tests__/xss-prevention.test.ts` — 15 failures:
- 5× `ProfileQuerySchema.safeParse({ id: '<script>…' })` → `Expected: false, Received: true`
- 9× "Safe String Acceptance" on `AlertCreateBodySchema.safeParse({ level, component, message })` → `Expected: true, Received: false`
- 1× `JSON.stringify(...)` expected to contain `<script>`

## Symptom

Script-tag query params look "accepted", normal text looks "rejected", and JSON output is not unicode-escaped.

## Reproduction

1. `cd dashboard && npx jest app/api/__tests__/xss-prevention.test.ts`

## Suspected Code Paths

- `dashboard/lib/validation/schemas.ts` `ProfileQuerySchema`: the only field is `userId` (min 1, max 100) with no character allowlist. `z.object` strips the unknown key `id`, so `{id: '<script>'}` parses to `{}` and succeeds.
- `dashboard/lib/validation/schemas.ts` `AlertCreateBodySchema`: requires `title` and `message` (and accepts `severity`, `tags`). The tests send `level`/`component`, the shape of the legacy `AlertCreateSchema` in `lib/validation.ts`. The missing `title` causes the failure.
- `dashboard/app/api/profiles/route.ts` GET: validates the query but **never reads `userId`**, so no query value is reflected or used in any sink.
- JSON test: `JSON.stringify` never escapes `<`. JSON responses served as `application/json` are not an HTML sink.

## Root Cause Hypothesis

Confidence: high. The tests were written against older schema shapes (`id`, `level`/`component`) and a false assumption about JSON serialization. There is no exploitable XSS path. Separately, `ProfileQuerySchema.userId` is less strict than `ProfileDeleteSchema.userId`, which uses `/^[a-zA-Z0-9_-]+$/`. That is a consistency and hardening gap, not a live vulnerability.

## Proposed Remediation

**Preferred**:
1. Add `.regex(/^[a-zA-Z0-9_-]+$/)` to `ProfileQuerySchema.userId` to match `ProfileDeleteSchema`. It is defense in depth: the field is currently unused.
2. Rewrite the tests to use the real field names: `userId` for profile queries; `title`/`message`/`severity` for alerts.
3. Replace the JSON-escape assertion. It should assert that a serialized payload round-trips unchanged.

**Files likely to change**:
- `dashboard/lib/validation/schemas.ts` (one regex line)
- `dashboard/app/api/__tests__/xss-prevention.test.ts`

**Tests to add or update**:
- `ProfileQuerySchema` rejects `<script>`, event-handler and `data:` payloads in `userId`; accepts `user_123`.
- Safe-string cases use the `AlertCreateBodySchema` shape.

## Risks & Considerations

- The regex on `userId` could reject legitimate IDs with other characters. No caller sends `userId` today (the GET ignores it), so risk is negligible.

## Open Questions

- None.
