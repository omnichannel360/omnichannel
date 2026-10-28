# Bug Fix: Profiles route traces the whole project into the server bundle

- **Slug**: profiles-trace-whole-project
- **Fixed**: 2026-10-28
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Marked the two filesystem calls on `PROFILES_DIR` with `/*turbopackIgnore: true*/` so the build
tracer no longer assumes they may touch any project file. Runtime behaviour is unchanged.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `dashboard/app/api/profiles/route.ts` | modified | ignore comment on `fs.stat` and `fs.readdir`, plus one-line rationale |

## Diff Highlights (optional)

```ts
// Profiles are runtime data outside the deploy; keep the build tracer from bundling the whole project
try {
  await fs.stat(/*turbopackIgnore: true*/ PROFILES_DIR)
...
const entries = await fs.readdir(/*turbopackIgnore: true*/ PROFILES_DIR, { withFileTypes: true })
```

## Tests Added or Updated

- None. The regression is a build-time diagnostic; it is checked by `next build` (see below).
  Existing `/api/profiles` tests cover runtime behaviour.

## Local Verification

- `npx next build` → "Compiled successfully"; the "Turbopack build encountered 2 warnings" block
  (Dynamic filesystem access, route.ts:86 and :95) no longer appears.
- `npx jest profiles security endpoints.integration api-auth-integration` → 7 suites passed,
  361 passed / 27 skipped / 0 failed.

## Deviations from Assessment

None.

## Follow-ups

- Separate item: rename `middleware.ts` → `proxy.ts` (Next 16 deprecation warning still shown).
