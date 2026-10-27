# Bug Assessment: POST /api/auth mints admin JWTs without credentials

- **Slug**: auth-token-mint-unauthenticated
- **Created**: 2026-10-28
- **Source**: found during code review of rate-limit follow-ups (fix/dashboard-test-suite)
- **Verdict**: valid
- **Severity**: critical

## Report

Found while tracing which rate limiter guards the auth routes. `POST /api/auth` accepts `{ userId, email, role }` and returns a signed 24h access token plus a 7d refresh token. It does not check any password, session or existing token.

## Symptom

Any unauthenticated client can request `{"userId":"x","email":"x@x.io","role":"admin"}` and receive a valid admin JWT. Middleware then accepts that JWT on every protected route (`/api/alerts`, `/api/brain`, `/api/conductor`, `/api/kanban`, `/api/meetings`, `/api/metrics`, `/api/profiles`). Expected: tokens are issued only after credentials are verified (that is what `/api/auth/login` does).

## Reproduction

1. `POST /api/auth` with `Content-Type: application/json` and body `{"userId":"attacker","email":"a@a.io","role":"admin"}`.
2. The response contains `data.accessToken`.
3. `GET /api/kanban` with `Authorization: Bearer <accessToken>` returns 200 with admin role headers.

Established by reading the code; not yet executed against a running server.

## Suspected Code Paths

- `dashboard/app/api/auth/route.ts:23-56`: `POST` validates the body shape, then calls `generateToken(userId, email, role)` without authenticating the caller.
- `dashboard/middleware.ts:52-56,157`: `AUTH_ROUTES` contains `/api/auth`, and `isProtectedRoute` returns false for any path starting with `/api/auth`, so this route is never gated.
- `dashboard/lib/validation/schemas.ts:322-335`: `role` allows `admin` from client input.
- `dashboard/lib/auth-config.ts:22`: `/api/auth` is declared `requireAuth: false, public: true`.

## Root Cause Hypothesis

This is a development token-minting endpoint that was never restricted after `/api/auth/login` (real credential check) was added. Confidence: high.

## Proposed Remediation

**Preferred**: require an authenticated **admin** caller on `POST /api/auth`. Verify the bearer token with `verifyToken` and reject with 401 if it is missing or invalid, or 403 if the role is not admin. This keeps the endpoint usable for an admin to issue service tokens. No in-app caller exists: the UI logs in through `/api/auth/login`, and only docs reference `POST /api/auth`.

**Alternatives**:
- Delete the route. This is the smallest attack surface, but it breaks any external script that mints tokens from it.
- Allow it only when `NODE_ENV !== 'production'`. This is weak: it depends on the env var being set correctly at deploy time.

**Files likely to change**:
- `dashboard/app/api/auth/route.ts`
- a route test (new) pinning 401 for anonymous, 403 for non-admin, 200 for admin

**Tests to add or update**:
- anonymous POST → 401, no token in the body
- user-role token → 403
- admin token → 200 with tokens

## Risks & Considerations

- Any external script that relies on anonymous token minting will break. This is intentional.
- If the dashboard has been reachable from the network, assume tokens may already have been minted: rotating `JWT_SECRET` invalidates every outstanding token (all users must log in again).
- `middleware.ts` prefix matching (`startsWith('/api/auth')`) also exempts any future `/api/auth*` route. That is worth tightening separately.

## Open Questions

- [NEEDS CLARIFICATION: does any external script or service call `POST /api/auth` today?]
- [NEEDS CLARIFICATION: has the dashboard been exposed beyond localhost? If yes, rotate JWT_SECRET.]
