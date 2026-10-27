# Bug Assessment: Lowercase "bearer" auth scheme rejected

- **Slug**: bearer-scheme-case
- **Created**: 2026-10-28
- **Source**: pasted text (failing test `tests/auth.middleware.test.ts` "should handle case-insensitive Bearer prefix")
- **Verdict**: valid
- **Severity**: low

## Report (verbatim or summarized)

A valid token sent as `authorization: bearer <token>` is rejected (`Expected: true, Received: false`).

## Symptom

RFC 7235 §2.1 defines the auth-scheme as case-insensitive. Clients that send `bearer` (some HTTP libraries and proxies normalize the case) get 401 with a valid token.

## Reproduction

1. Generate a token with `generateToken`.
2. Call the API with `Authorization: bearer <token>`.
3. Observe 401. The same request with `Bearer` succeeds.

## Suspected Code Paths

- `dashboard/lib/auth.ts:~61`: `startsWith('Bearer ')`
- `dashboard/middleware.ts:~107`: `startsWith('Bearer ')` in `extractToken`

## Root Cause Hypothesis

Confidence: high. A case-sensitive prefix match.

## Proposed Remediation

**Preferred**: Match `/^Bearer\s+(\S+)$/i` in both places. This is still strict about the token shape: there must be exactly one non-space token after the scheme. The existing "trailing extra data" rejection test stays green.

**Files likely to change**:
- `dashboard/lib/auth.ts`, `dashboard/middleware.ts`
- `dashboard/tests/api/auth.test.ts` (currently pins the case-sensitive rejection; flip it to acceptance)

**Tests to add or update**:
- `tests/auth.middleware.test.ts` case-insensitive case (RED → GREEN).
- `tests/api/auth.test.ts` lowercase case → accept.

## Risks & Considerations

- Security: this widens accepted *formats*, not credentials; a signature is still required. There is no bypass.

## Open Questions

- None.
