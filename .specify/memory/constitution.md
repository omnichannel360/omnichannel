> **DRAFT — review before relying on it**

# OmniCompany Constitution

## Core Principles

### 1. The real application is `dashboard/`
The repo root is mostly generated audit and delivery reports (hundreds of `AUDIT_*`, `FINAL_*`, `SECURITY_*`, `TEST_AUDIT_*` files) plus stray artifacts (e.g. files literally named `C:UsersAdministrator...`). The app is the Next.js project in `dashboard/` (package name `omniforge-dashboard`); CI and Vercel config both operate from it (dashboard/package.json; .github/workflows/deploy.yml `working-directory: ./dashboard`; dashboard/vercel.json). The root also holds `company-brain/`, `config/meetings.yaml`, `skills/` and `scripts/run_meeting.py`, which support the meetings / agent-team features. Treat root report files as history, not specification.

### 2. TypeScript strict, with a stricter build tsconfig
`strict: true`, `isolatedModules`, `moduleResolution: bundler`, `@/*` alias to the dashboard root (dashboard/tsconfig.json). Production builds use `tsconfig.build.json`, which excludes tests (dashboard/tsconfig.build.json). `next.config.js` only allows `ignoreBuildErrors` when `SKIP_TYPECHECK=1` is set, described as an emergency hatch for server deploys; the default stays strict (dashboard/next.config.js).

### 3. ESLint rules as configured
Extends `next/core-web-vitals` and `next/typescript`. Errors: `no-console` (except `warn`/`error`), `no-explicit-any`, `no-unused-vars` (underscore prefix ignored), `prefer-const`, `no-var`, `eqeqeq`, `no-empty-function`, `no-implicit-coercion`, `await-thenable`. Warnings: explicit return/module-boundary types, `no-floating-promises`, `no-misused-promises` (dashboard/.eslintrc.json). Logging goes through `lib/logger.ts` rather than `console`.

### 4. Tests use Jest with an 80% global coverage threshold
Jest 29 + ts-jest + Testing Library; `testMatch` `**/*.test.ts(x)`; `coverageThreshold.global` is 80% for branches, functions, lines and statements, collected from `lib/`, `app/api/` and `components/` (dashboard/jest.config.js). About 110 test files exist under `dashboard/` (`lib/*.test.ts`, `__tests__/`, `app/api/__tests__/`, `tests/`). Test env sets a throwaway `JWT_SECRET` (dashboard/jest.setup.ts). The repo owner's `.audit-guardrails.json` also records the same 80% target for new code and a 800-line soft file ceiling (.audit-guardrails.json `guardrails.code_quality`). Whether current coverage actually meets 80% was not verified for this draft.

### 5. API routes are authenticated by default for the listed prefixes
`middleware.ts` verifies a JWT (via `jose`) for `/api/alerts`, `/api/brain`, `/api/conductor`, `/api/kanban`, `/api/meetings`, `/api/metrics`, `/api/profiles`; all other `/api/*` routes are treated as public (auth and health are intended public). It does RBAC and injects auth context via headers (dashboard/middleware.ts header comment and `PROTECTED_ROUTES`). New API routes must be added to that list if they need protection. next-auth 4 is also a dependency; `middleware-nextauth.ts` and several `lib/*auth*` modules coexist, so which is canonical is not settled (dashboard/package.json, dashboard directory).

### 6. Errors, input, rate limits and file I/O have shared helpers
Use the shared modules rather than ad-hoc code: `lib/error-handling*.ts` / `api-error-handler.ts` / `async-route.ts` (error responses with correlation IDs and `ERROR_CODES`), `lib/input-validation.ts` and zod 3 for validation, `lib/rate-limit*.ts` and `rateLimit/` for rate limiting, `lib/csrf-protection.ts`, and `lib/atomic-file-ops.ts` + `lib/file-lock.ts` for JSON file reads/writes (dashboard/lib). The guardrails file adds: JSON parsing in try/catch, no swallowed errors in catch blocks, no hardcoded secrets (.audit-guardrails.json). Note there are multiple overlapping versions (`error-handling.ts`, `error-handling-v2.ts`, `error-handler.ts`); consolidation has not been done.

### 7. Persistence is JSON files on disk
App state (alerts, kanban, meetings, conductor logs) is stored as JSON files in `dashboard/data/` and read/written through the atomic/locked helpers (dashboard/data/, dashboard/lib/atomic-file-ops.ts). No database or migrations were found. Anything that needs multi-instance or serverless deployment (Vercel is configured) conflicts with local-disk state; this is unresolved.

### 8. Agent dispatch goes through GitHub issues
The conductor turns a dashboard dispatch into a GitHub issue labelled `agent`, only when `AGENT_GITHUB_TOKEN` and `AGENT_GITHUB_REPO` (validated against `owner/repo`) are configured; otherwise it reports `not_configured` (dashboard/lib/github-dispatch.ts). Tokens come from the environment only.

## Stack and Constraints

- Next.js ^16.4.2 (App Router: `app/`), React 19, TypeScript 5.8.2, Tailwind 4 via `@tailwindcss/postcss`, recharts 2.15, react-force-graph-2d, zod 3, jsonwebtoken, next-auth 4 (dashboard/package.json).
- Package manager: npm (`package-lock.json` in `dashboard/`); Vercel installs with `npm install --legacy-peer-deps` (dashboard/vercel.json).
- Deploy: `.github/workflows/deploy.yml` runs on push to `main`: `npm ci`, `npm run build`, `npm test -- --passWithNoTests` on Node 18, then only echoes that the app is "ready for deployment to Hetzner"; it does not actually deploy. `scripts/deploy.sh` is a manual Hetzner push script with a placeholder `YOUR_ORG` repo and requires `HETZNER_IP`. `dashboard/vercel.json` also defines a Vercel build.
- Python: `scripts/run_meeting.py` exists; no pyproject or requirements file was found.
- Secrets: `.env`, `.env.local`, `*.key`, `*.pem` are git-ignored (.gitignore). `.env.test` is committed at repo root and was not opened for this draft.

## Development Workflow

All commands from `dashboard/`:
- Dev: `npm run dev`
- Test: `npm test` (`npm run test:watch`, `npm run test:coverage`)
- Lint: `npm run lint` (script is `next lint`)
- Type check: `npx tsc --noEmit` (named in .audit-guardrails.json `tools`; no npm script exists)
- Build: `npm run build` (`next build`)
- Pre-merge checklist recorded in `.audit-guardrails.json`: `npm audit` 0 vulnerabilities, `tsc --noEmit` clean, `jest --coverage` above 80% and passing, no hardcoded secrets, all catch blocks log.
- Features follow Spec Kit: `/speckit-specify` -> `/speckit-clarify` -> `/speckit-plan` -> `/speckit-tasks` -> `/speckit-analyze` -> `/speckit-implement` -> `/speckit-converge`; bugs via `/speckit-bug-assess` -> `-fix` -> `-test` (CLAUDE.md). Run `graphify update .` after code changes (CLAUDE.md).
- Recent history uses conventional commits (`fix(conductor): ...`, `feat(conductor): ...`) (git log).

## Governance

This draft only records conventions found in files today. Amendments cite the source file and bump the version. `.audit-guardrails.json` is an aspirational checklist produced by a prior audit session ("enforcement": "mandatory" in its own text); items in it are listed here only where the repo's configs back them. Known mismatches to settle before ratification: CI uses Node 18 while Next 16 needs a newer Node; `next lint` is the lint script; `npm audit` zero-vulnerabilities is stated but unverified; the hundreds of root report files should be archived or ignored.

**Version**: 0.1.0-draft | **Ratified**: TODO | **Last Amended**: 2026-10-27
