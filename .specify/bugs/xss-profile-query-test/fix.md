# Bug Fix: XSS tests "accept script tag in query param"

- **Slug**: xss-profile-query-test
- **Fixed**: 2026-10-28
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Hardened `ProfileQuerySchema.userId` with the same character allowlist as `ProfileDeleteSchema` (written test-first). Rewrote the XSS suite to use the real schema fields, so its assertions exercise the actual filters instead of failing on a missing required field.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `dashboard/lib/validation/schemas.ts` | modified | `ProfileQuerySchema.userId` gains `.regex(/^[a-zA-Z0-9_-]+$/)` |
| `dashboard/app/api/__tests__/xss-prevention.test.ts` | modified | `id` → `userId`; `{level, component}` → `{title}` (≈50 cases); JSON test → round-trip; 5 inert-encoding cases flipped (see Deviations); added a positive `userId` case |

## Tests Added or Updated

- `URL Parameters XSS Prevention › should reject query parameter with script tag / event handler / data protocol` — now meaningful (RED before the regex, GREEN after).
- `URL Parameters XSS Prevention › should accept a well-formed userId query parameter` — guards against over-blocking.
- All `AlertCreateBodySchema` rejection cases now put the payload in `title`. Previously they "passed" only because `title` was missing.

## Local Verification

- RED: after the test rewrite, 10 failed (5 `userId`, 5 newly exposed — see below).
- GREEN: `npx jest --runTestsByPath app/api/__tests__/xss-prevention.test.ts` → pass (part of the 178/178 run).
- `grep -rn "dangerouslySetInnerHTML\|innerHTML ="` over `app/ components/ lib/` (excluding tests) → no matches.

## Deviations from Assessment

- **New finding**: once payloads went into the real `title` field, 5 cases failed: HTML-entity-encoded script text, double-URL-encoded text, literal `<` / `\x3c` escape text, and legacy CSS `expression()` markup. `createSafeString` is a blocklist of *executable* vectors (script tags, event handlers, `javascript:`/`data:`/`vbscript:`). It never tried to block already-encoded text.
- **Decision**: no widening of the blocklist. The UI renders through React (auto-escaped) and has no HTML sinks, so these strings display as inert text. Blocking them would reject legitimate content such as "a &lt; b". The 5 tests now assert acceptance, with an inline policy comment.
- **If a stricter policy is wanted** (e.g. future HTML/email/PDF rendering of alert titles), re-run `/speckit-bug-assess` with that requirement.

## Follow-ups

- If alert content is ever rendered outside React (email, PDF, Slack), revisit output encoding at that sink.
