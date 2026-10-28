# Bug Assessment: `middleware.ts` uses the file convention deprecated in Next.js 16

- **Slug**: middleware-proxy-rename
- **Created**: 2026-10-28
- **Source**: pasted text (local `next build` output)
- **Verdict**: valid
- **Severity**: low

## Report (verbatim or summarized)

> ⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
> To migrate automatically, run: npx @next/codemod@canary middleware-to-proxy .

## Symptom

Every `next build` / `next dev` prints the deprecation warning. The file still works today, but a
future Next.js major is expected to drop the `middleware` convention, which would silently remove
all API auth (the file is the auth gate for every protected route).

## Reproduction

1. `cd dashboard && npx next build`
2. Observe the deprecation warning at the top of the output.

Reproduced 2026-10-28, Next.js 16.4.2.

## Suspected Code Paths

- `dashboard/middleware.ts` — `export async function middleware(...)` and `export const config`.
- Importers of the root middleware (tests only):
  `middleware.test.ts`, `lib/middleware.test.ts`, `tests/api/auth.test.ts`,
  `tests/auth.middleware.test.ts`, `__tests__/api/endpoints.integration.test.ts`,
  `__tests__/auth-hardening.test.ts`.

## Root Cause Hypothesis

Next.js 16 renamed the convention to `proxy.ts` with an exported `proxy` function
(per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). The
project predates the rename. Confidence: high.

## Proposed Remediation

**Preferred**: Do what the official codemod does, by hand (keeps the change reviewable and avoids
running a `@canary` package): `git mv middleware.ts proxy.ts`, rename the exported function
`middleware` → `proxy`, keep `config` and all logic unchanged. Rename `middleware.test.ts` →
`proxy.test.ts` and point the six test importers at `@/proxy`.

Proxy runs on the Node.js runtime by default (docs: "Proxy defaults to using the Node.js
runtime"); the file sets no `runtime` option, and `jose` works on Node, so no logic changes.

**Alternatives**:
- Run `npx @next/codemod@canary middleware-to-proxy .` — same result, but executes an unpinned
  canary package and may also rewrite the disabled `middleware-nextauth.ts`. Rejected.

**Files likely to change**:
- `dashboard/middleware.ts` → `dashboard/proxy.ts`
- `dashboard/middleware.test.ts` → `dashboard/proxy.test.ts`
- the five other test files above (import path only)

**Tests to add or update**:
- Existing auth/middleware suites (incl. `auth-hardening.test.ts`, 24 tests) exercise the renamed
  `proxy` export unchanged; they are the regression net.
- Build check: `next build` lists "ƒ Proxy" and prints no deprecation warning.

## Risks & Considerations

- If the file were not picked up as proxy, every protected route would become open. The build
  route table ("ƒ Proxy") plus a manual request check guard against that.
- Runtime moves from Edge to Node; behaviour is the same, and the logger is already Web-Crypto-only.

## Open Questions

- None.
