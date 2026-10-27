# Bug Verification: XSS tests "accept script tag in query param"

- **Slug**: xss-profile-query-test
- **Tested**: 2026-10-28
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

`ProfileQuerySchema.userId` now rejects script, event-handler and `data:` payloads, confirmed RED → GREEN. The suite now exercises the real `title`/`message` filters. A new guard test fails if any raw-HTML sink is added, which enforces the "encoded text is inert" policy.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `npx jest --runTestsByPath app/api/__tests__/xss-prevention.test.ts` | pass | 15 original failures resolved |
| RED before schema change | same command, pre-regex | fail (10) as expected | 5 `userId` + 5 newly exposed policy cases |
| New / updated tests | guard: no raw-HTML sinks; positive `userId`; `NextResponse.json` content-type | pass | guard scans `app/`, `components/`, `lib/` (excludes tests) |
| Sink audit | grep `dangerouslySetInnerHTML\|innerHTML\|insertAdjacentHTML`; check `package.json` for markdown/email renderers | none found | confirmed independently by the reviewer agent |
| Caller impact of regex | grep callers of `GET /api/profiles` | none send `userId` | GalaxyGraph, OrgChart, examples |
| Regression suite | `npx jest --json` (full) | pass (no new failures) | 0 newly failing |
| Type-check | `npx tsc --noEmit` | no new errors in changed files | |
| Independent review | `ecc:code-reviewer` | approve | MEDIUM findings addressed: tautological JSON test replaced, sink guard added |

## Output Excerpts

```
PASS app/api/__tests__/xss-prevention.test.ts
```

## Residual Risks

- The rejection cases assert only `success === false`, not which field failed. Mitigated: the "Safe String Acceptance" tests prove the same base payload (`message: 'Test message'`) is valid, so a broken base would fail them.
- If alert content is ever rendered outside React (email, PDF, Slack), the inert-text policy must be revisited. The guard covers only in-repo React sinks.

## Recommendation

Close the bug. Hardening verified, and the suite now tests real behavior.
