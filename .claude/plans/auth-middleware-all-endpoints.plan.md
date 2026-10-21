# Plan: Add Auth Middleware (Protect All Endpoints)

**Source**: Current OmniChannel Dashboard API
**Complexity**: MEDIUM
**Estimated Time**: 4-6 hours

## Summary

The dashboard API has middleware and route handlers that provide authentication, but the implementation is inconsistent. Some routes manually check auth with `verifyAuth()` while others exist without protection. This plan consolidates auth into a unified middleware + route handler pattern to eliminate redundancy and ensure all endpoints are protected.

**Current State**: 
- Middleware exists at `dashboard/middleware.ts` (applied at edge)
- Routes manually verify auth with `verifyAuth()` in each handler
- Helper function `protectRoute()` exists but is underutilized
- Routes: alerts, brain, conductor, kanban, meetings, metrics, profiles (protected); health (public); auth/* (public)

**Target State**:
- Single source of truth for auth logic
- All protected routes wrapped with `protectRoute()` or `protectRouteMulti()`
- Consistent error responses across all endpoints
- Clear separation: middleware handles early rejection, route handlers extract context
- Comprehensive test coverage (80%+)

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| **Protected Route** | `lib/protected-route.ts:26-65` | Wrap handler with `protectRoute(handler, config)` |
| **Multi-Method Routes** | `lib/protected-route.ts:86-109` | Use `protectRouteMulti({ GET, POST, ... }, config)` for routes with multiple methods |
| **Error Handling** | `app/api/alerts/route.ts:29-37` | Check auth result, log unauthorized attempts, return 401 |
| **Logging** | `lib/logger.ts` | Use logger with context: `logger.error/warn/info(message, { userId, path, ... })` |
| **Auth Verification** | `lib/auth.ts:48-54` | Call `verifyAuth(request)` to get `{ authenticated, error, payload }` |
| **Response Format** | `app/api/alerts/route.ts:48-50+` | Return `{ success, data?, error?, meta? }` envelope |

---

## Files to Change

| File | Action | Why |
|---|---|---|
| `dashboard/app/api/alerts/route.ts` | UPDATE | Remove manual `verifyAuth()` calls, wrap with `protectRoute()` |
| `dashboard/app/api/brain/route.ts` | UPDATE | Remove manual `verifyAuth()` calls, wrap with `protectRoute()` |
| `dashboard/app/api/conductor/route.ts` | UPDATE | Remove manual `verifyAuth()` calls, wrap with `protectRoute()` |
| `dashboard/app/api/kanban/route.ts` | UPDATE | Remove manual `verifyAuth()` calls, wrap with `protectRoute()` |
| `dashboard/app/api/meetings/route.ts` | UPDATE | Remove manual `verifyAuth()` calls, wrap with `protectRoute()` |
| `dashboard/app/api/metrics/route.ts` | UPDATE | Remove manual `verifyAuth()` calls, wrap with `protectRoute()` |
| `dashboard/app/api/profiles/route.ts` | UPDATE | Remove manual `verifyAuth()` calls, wrap with `protectRoute()` |
| `dashboard/middleware.ts` | VERIFY | Ensure all protected routes are listed in `PROTECTED_ROUTES` |
| `dashboard/lib/auth-middleware-wrapper.ts` | VERIFY | Confirm it works correctly with Next.js headers |
| **NEW**: `dashboard/__tests__/auth-middleware.integration.test.ts` | CREATE | Test all protected endpoints with/without auth |
| **NEW**: `dashboard/.claude/docs/AUTH_IMPLEMENTATION.md` | CREATE | Document the auth pattern for future devs |

---

## Tasks

### Task 1: Audit Current Routes
**Action**: 
- Check all 11 route.ts files for manual `verifyAuth()` calls
- Identify which routes call `verifyAuth()` vs. which use `protectRoute()`
- List which routes have multiple HTTP methods (GET, POST, PUT, DELETE, PATCH)

**Mirror**: Check existing patterns in `protected-route.ts`

**Validate**: 
```bash
grep -r "verifyAuth\|protectRoute" dashboard/app/api --include="*.ts" | grep -v test | grep -v node_modules
```

### Task 2: Create Unified Auth Middleware Wrapper (Already Exists)
**Action**:
- Verify `auth-middleware-wrapper.ts` is production-ready
- Confirm it extracts `x-user-id`, `x-user-email`, `x-user-role` headers correctly
- Ensure rate limiting integration is correct

**Mirror**: Follow Next.js Request/Response patterns from `lib/auth.ts`

**Validate**:
```bash
npm test -- --testPathPattern="auth-middleware-wrapper"
```

### Task 3: Refactor Routes to Use protectRoute()
**Action**:
For each protected route:
1. Remove manual `verifyAuth()` call
2. Remove auth error handling from route body
3. Wrap route handlers with `protectRoute()` or `protectRouteMulti()`
4. Extract user info from route context parameter instead of request headers
5. Keep rate limiting calls (they're orthogonal to auth)

Example transformation:

**BEFORE**:
```typescript
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Unauthorized')
  }
  // handler logic
}
```

**AFTER**:
```typescript
export const GET = protectRoute(
  async (request, { userId, email, role }) => {
    // handler logic (auth is already verified)
  },
  { requireAuth: true, rateLimitKey: 'endpoint_name' }
)
```

**Routes to refactor**:
- `app/api/alerts/route.ts` → GET, POST
- `app/api/brain/route.ts` → GET, POST
- `app/api/conductor/route.ts` → GET, POST
- `app/api/kanban/route.ts` → GET, POST, PUT, DELETE
- `app/api/meetings/route.ts` → GET, POST
- `app/api/metrics/route.ts` → GET, POST
- `app/api/profiles/route.ts` → GET, POST, PUT

**Mirror**: Use pattern from `protected-route.ts:26-29` and `protected-route.ts:86-109`

**Validate**: Each route should compile with no TypeScript errors and auth context types should match

### Task 4: Verify Middleware Configuration
**Action**:
- Confirm `middleware.ts` lists all protected routes in `PROTECTED_ROUTES` array
- Confirm public routes are listed in `PUBLIC_ROUTES` array (currently only `/api/health`)
- Confirm auth routes are listed in `AUTH_ROUTES` array
- Verify matcher pattern covers all API routes

**Checklist**:
- [ ] `/api/alerts` → in PROTECTED_ROUTES
- [ ] `/api/brain` → in PROTECTED_ROUTES
- [ ] `/api/conductor` → in PROTECTED_ROUTES
- [ ] `/api/kanban` → in PROTECTED_ROUTES
- [ ] `/api/meetings` → in PROTECTED_ROUTES
- [ ] `/api/metrics` → in PROTECTED_ROUTES
- [ ] `/api/profiles` → in PROTECTED_ROUTES
- [ ] `/api/health` → in PUBLIC_ROUTES
- [ ] `/api/auth/*` → in AUTH_ROUTES
- [ ] Matcher includes `/api/:path*`

### Task 5: Create Comprehensive Auth Integration Tests
**Action**:
Create `__tests__/auth-middleware.integration.test.ts` that tests:

1. **Protected Endpoint Tests**:
   - ✅ Valid JWT → returns 200 with data
   - ❌ Missing JWT → returns 401 Unauthorized
   - ❌ Expired JWT → returns 401 Unauthorized
   - ❌ Invalid JWT signature → returns 401 Unauthorized
   - ✅ JWT with user context → context passed to handler

2. **Public Endpoint Tests**:
   - ✅ `/api/health` → returns 200 without JWT
   - ✅ `/api/auth/login` → returns 200 without JWT
   - ✅ `/api/auth/verify` → returns 200 without JWT

3. **Middleware Layer Tests**:
   - Rate limiting applied to auth endpoints
   - Headers attached correctly (x-user-id, x-user-email, x-user-role)
   - All protected routes reject unauthenticated requests early

4. **Error Response Consistency**:
   - All 401 responses have consistent format: `{ success: false, error: string }`
   - All 429 (rate limit) responses have consistent format
   - No leaking of sensitive info in error messages

**Test Structure** (AAA pattern):
```typescript
describe('Auth Middleware - Protected Endpoints', () => {
  test('GET /api/alerts with valid JWT returns 200', async () => {
    // Arrange: Generate valid JWT
    // Act: Call GET /api/alerts with JWT
    // Assert: status === 200, success === true
  })

  test('GET /api/alerts without JWT returns 401', async () => {
    // Arrange: No JWT
    // Act: Call GET /api/alerts
    // Assert: status === 401, error contains 'Unauthorized'
  })
  // ... more tests
})
```

**Mirror**: Follow test pattern from `lib/auth-middleware.test.ts` and `lib/protected-route.test.ts`

**Validate**:
```bash
npm test -- --testPathPattern="auth-middleware.integration"
```

### Task 6: Documentation & Developer Guide
**Action**:
Create `.claude/docs/AUTH_IMPLEMENTATION.md` documenting:

1. **How Auth Works** (3 layers):
   - Middleware layer (edge): Early rejection, rate limit, header attachment
   - Route handler layer: Auth context extraction and validation
   - Business logic layer: Use authenticated user context

2. **Adding a New Protected Endpoint**:
   - Create route file
   - Import `protectRoute` or `protectRouteMulti`
   - Wrap handler: `export const GET = protectRoute(async (request, { userId }) => {...})`
   - Add route to `middleware.ts` PROTECTED_ROUTES array
   - Write integration test

3. **Auth Context Available**:
   - `userId`: string (JWT `sub` claim)
   - `email`: string (JWT `email` claim)
   - `role`: string (JWT `role` claim)

4. **Error Responses**:
   - 401 Unauthorized (missing/invalid JWT)
   - 403 Forbidden (insufficient permissions - for future role checks)
   - 429 Too Many Requests (rate limited)

5. **Testing Checklist**:
   - Route requires auth? → Test with valid JWT (200) and without JWT (401)
   - Multiple methods? → Test each method separately
   - Uses user context? → Verify userId/email/role passed correctly
   - Modifies data? → Test rate limiting on POST/PUT/DELETE

**Mirror**: Follow documentation style from existing route implementations

---

## Validation

### Pre-Refactor Validation
```bash
# 1. Confirm all imports resolve
npm run type-check

# 2. Count current auth patterns
grep -c "verifyAuth" dashboard/app/api/**/*.ts
echo "Should be ~14 (2 methods × 7 protected routes)"

# 3. List all route files
find dashboard/app/api -name "route.ts" | wc -l
echo "Should be 11 total routes (7 protected + 3 auth + 1 health)"
```

### Post-Refactor Validation
```bash
# 1. Type check passes
npm run type-check

# 2. All auth patterns removed from routes
! grep -r "verifyAuth" dashboard/app/api --include="*.ts" | grep -v test | grep -v node_modules

# 3. All protected routes wrapped with protectRoute
grep -c "protectRoute" dashboard/app/api/**/*.ts
echo "Should be ~7 (one per protected endpoint)"

# 4. Middleware lists all protected routes
grep -A 10 "PROTECTED_ROUTES" dashboard/middleware.ts | wc -l
echo "Should list: alerts, brain, conductor, kanban, meetings, metrics, profiles"

# 5. All tests pass
npm test -- --testPathPattern="auth"

# 6. No console.log statements in auth code
! grep -r "console\\.log" dashboard/lib/auth* dashboard/lib/protected-route.ts
```

### Integration Validation
```bash
# 1. Start dev server
npm run dev

# 2. Protected endpoint test (should fail without auth)
curl -X GET http://localhost:3000/api/alerts
# Expected: 401 Unauthorized

# 3. Protected endpoint test (should succeed with auth)
TOKEN=$(npm run get-test-token | tail -1)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/alerts
# Expected: 200 OK with data

# 4. Public endpoint test (should work without auth)
curl -X GET http://localhost:3000/api/health
# Expected: 200 OK
```

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Breaking existing clients** | HIGH | Keep auth format identical; only change internal implementation. Add integration tests before refactor. |
| **Inconsistent auth responses** | MEDIUM | Use shared error response enum from `lib/auth.ts` AuthErrors. Create response helper. |
| **Missing route in middleware** | MEDIUM | Add new routes to PROTECTED_ROUTES immediately after creating route.ts. Pre-commit hook can validate. |
| **Type mismatches in context** | LOW | Use TypeScript's `RouteHandler` type from `protected-route.ts` strictly. Run `npm run type-check`. |
| **Rate limiting conflicts** | LOW | Middleware handles rate limiting; route handlers should not duplicate. Doc this clearly. |
| **Performance regression** | LOW | Middleware runs at edge (Vercel) → minimal latency. One less auth call per route (fewer JWT verifications). |

---

## Acceptance Criteria

- [ ] All 7 protected routes refactored to use `protectRoute()` or `protectRouteMulti()`
- [ ] Zero manual `verifyAuth()` calls in route handlers (except in legacy compatibility layer)
- [ ] Middleware.ts PROTECTED_ROUTES array matches actual protected endpoints
- [ ] All auth integration tests pass (80%+ coverage)
- [ ] No TypeScript errors: `npm run type-check` passes
- [ ] No console.log in auth code
- [ ] Documentation created at `.claude/docs/AUTH_IMPLEMENTATION.md`
- [ ] Code review: no hardcoded secrets, no error message info leaks
- [ ] Integration test confirms:
  - ✅ Protected endpoint + valid JWT → 200 OK
  - ❌ Protected endpoint + no JWT → 401 Unauthorized
  - ❌ Protected endpoint + invalid JWT → 401 Unauthorized
  - ✅ Public endpoint + no JWT → 200 OK
  - ✅ Auth context (userId, email, role) propagated correctly

---

## Rollback Plan

If issues arise post-deployment:

1. **Revert route changes**: Restore manual `verifyAuth()` calls from git
2. **Keep middleware**: Middleware is read-only at edge, doesn't break anything
3. **Test points**:
   - Verify endpoints respond with same auth errors as before
   - Verify rate limiting still works
   - Verify user context still available

Estimated rollback time: < 15 minutes (git revert + redeploy)

---

## Next Steps (After Approval)

1. Run Task 1 (Audit) to confirm current state
2. Implement Task 2-4 in parallel using agents
3. Create comprehensive tests (Task 5)
4. Document pattern (Task 6)
5. Run validation suite
6. Open PR with detailed commit messages
7. Review and deploy

**Ready to proceed?** Reply with `yes`, `proceed`, or list any modifications to this plan.
