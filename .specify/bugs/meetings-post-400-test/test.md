# Bug Verification: Valid meetings POST returns 400 in tests

- **Slug**: meetings-post-400-test
- **Tested**: 2026-10-28
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Valid POSTs return 200 and persist exactly once (`atomicUpdate` called 1×). Invalid `meeting_type` values return 400 from schema validation, not the Content-Type check, and never persist. GET returns 200. No real data files were written.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `npx jest --runTestsByPath __tests__/api/meetings.test.ts` | pass | 7 original failures resolved |
| Rejections are schema-driven | `expect(String(data.error)).not.toMatch(/content-type/i)` (×8) | pass | previously vacuous |
| Persistence assertions | `atomicUpdate` called 1× on accept, 0× on reject | pass | added after reviewer finding |
| No real writes | `git status -- dashboard/data company-brain` | clean | mocks held |
| Mock fidelity | `atomicUpdate(path, transform, fallback)` vs `lib/atomic-file-ops.ts:68` | compatible | confirmed by the reviewer agent |
| Regression suite | `npx jest --json` (full) | pass (no new failures) | 0 newly failing |
| Type-check | `npx tsc --noEmit` | no new errors | `POST possibly undefined` errors predate this fix |
| Independent review | `ecc:code-reviewer` | approve | |

## Output Excerpts

```
PASS __tests__/api/meetings.test.ts
```

## Residual Risks

- Rate limiting is mocked here, so the 429 path is covered only by dedicated rate-limit suites. Some of those still fail on stale APIs and are scheduled for step 2.
- Two `safeJoin` implementations exist. The live one (`lib/validation.ts`) shadows the stricter `lib/validation/index.ts`. Consolidating them is a follow-up.

## Recommendation

Close the bug. Verified at the route-handler level.
