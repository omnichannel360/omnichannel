# Bug Assessment: Profiles route traces the whole project into the server bundle

- **Slug**: profiles-trace-whole-project
- **Created**: 2026-10-28
- **Source**: pasted text (plus local `next build` output)
- **Verdict**: valid
- **Severity**: low

## Report (verbatim or summarized)

> next build (Turbopack) warns "Dynamic filesystem access causes tracing of the whole project" at
> app/api/profiles/route.ts:86 (fs.stat(PROFILES_DIR)) and :95 (fs.readdir(PROFILES_DIR)).
> PROFILES_DIR resolves at runtime to ~/.hermes/profiles (outside the project; fallback
> process.cwd()/config/profiles). Effect: entire project including public/ is traced into the
> server output, bloating deploys.

## Symptom

`npx next build` completes but emits two Turbopack warnings for `app/api/profiles/route.ts`, and
output file tracing pulls every project file into the server bundle. Expected: no warning; only
files the route actually needs are traced.

## Reproduction

1. `cd dashboard && npx next build`
2. Observe "Turbopack build encountered 2 warnings" → both "Dynamic filesystem access causes
   tracing of the whole project", pointing at `route.ts:86` and `route.ts:95`.

Reproduced locally on 2026-10-28 (Next.js 16.4.2, Turbopack).

## Suspected Code Paths

- `dashboard/app/api/profiles/route.ts:29-41` — `getProfilesDir()` builds the path from
  `process.env.HOME || process.env.USERPROFILE`; not statically analysable.
- `dashboard/app/api/profiles/route.ts:44-54` — module-level `PROFILES_DIR`, falls back to
  `path.join(process.cwd(), 'config', 'profiles')`.
- `dashboard/app/api/profiles/route.ts:86` — `fs.stat(PROFILES_DIR)`.
- `dashboard/app/api/profiles/route.ts:95` — `fs.readdir(PROFILES_DIR, { withFileTypes: true })`.

## Root Cause Hypothesis

Turbopack's file tracer cannot resolve `PROFILES_DIR` statically (it depends on env vars and a
try/catch fallback), so it conservatively assumes the call may touch any file under the project
and traces everything. The directory is runtime data outside the deploy (`~/.hermes/profiles`),
so nothing from it should be bundled at all. Confidence: high (matches Turbopack's own diagnostic).

## Proposed Remediation

**Preferred**: Add `/*turbopackIgnore: true*/` to the path argument of the two flagged calls
(`fs.stat` and `fs.readdir`), with a short comment that profiles are runtime data outside the
deploy. This is the opt-out Turbopack recommends; behaviour at runtime is unchanged.

**Alternatives**:
- Make the path statically scoped (e.g. always `process.cwd()/config/profiles`) — changes where
  profiles are read from and breaks the `~/.hermes/profiles` contract with Hermes. Rejected.
- `outputFileTracingExcludes` in next.config — coarser, hides future real issues. Rejected.

**Files likely to change**:
- `dashboard/app/api/profiles/route.ts`

**Tests to add or update**:
- Regression is a build-time diagnostic, verified by `next build` showing no
  "Dynamic filesystem access" warning.
- Existing profiles route tests (covering `/api/profiles`) must still pass, proving runtime
  behaviour is unchanged.

## Risks & Considerations

- Ignore comment is a no-op at runtime; only affects tracing. If profiles were ever moved inside
  the project and expected to ship with the bundle, they would need explicit inclusion.
- `withFileLock(PROFILES_DIR, …)` is not flagged and is left unchanged.

## Open Questions

- None.
