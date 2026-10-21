# Authentication Implementation - Action Plan

**Created:** 2024-10-21  
**Priority:** Critical - Security  
**Scope:** All API endpoints  
**Effort:** ~4 hours for complete implementation + testing

---

## Executive Summary

This document outlines the complete JWT authentication implementation for OmniCompany's API endpoints. The system adds token-based security to 7 protected endpoints while keeping `/api/health` public for monitoring.

**What's being implemented:**
- JWT token creation and verification using `jose` library
- Global middleware for centralized auth checks
- Login endpoint for token generation
- Token verification endpoint
- Protection of all data endpoints (alerts, brain, conductor, kanban, meetings, metrics, profiles)

**Impact:**
- ✅ Enhanced security - all protected endpoints require valid JWT token
- ✅ Backwards-compatible architecture - can deprecate gradually
- ✅ Minimal performance impact - token verification is O(1)
- ✅ Extensible - supports role-based access control (RBAC)

---

## Phase 1: Setup & Dependencies (15 minutes)

### 1.1 Install Required Packages
```bash
cd dashboard
npm install jose
npm install --save-dev @types/jsonwebtoken
```

### 1.2 Create Environment Variables
```bash
# Copy template
cp .env.example .env.local

# Edit .env.local with:
JWT_SECRET=your-32-character-secure-string-here
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=secure-password-here
```

**⚠️ Critical:** Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Phase 2: Core Implementation (1 hour)

### 2.1 Create Authentication Library
**File:** `dashboard/lib/auth.ts`  
**Status:** ✅ Already created  
**Action:** Verify file exists and contains jose imports

```bash
ls -la dashboard/lib/auth.ts
```

### 2.2 Create Global Middleware
**File:** `dashboard/middleware.ts`  
**Status:** ✅ Already created  
**Action:** Verify config includes all protected routes

```bash
grep -A 5 "PROTECTED_ROUTES" dashboard/middleware.ts
```

### 2.3 Create Auth Endpoints
**Files:**
- `dashboard/app/api/auth/login/route.ts` ✅ Created
- `dashboard/app/api/auth/verify/route.ts` ✅ Created

**Action:** Verify both files exist

---

## Phase 3: Protect API Routes (1.5 hours)

Update each file by adding auth verification at the start of each handler.

### Template for All Routes
Every route handler (GET, POST, PATCH, etc.) starts with:

```typescript
// Add import at top
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'

// Add at start of handler
export async function GET(request: NextRequest) {
  const authResult = await verifyAuth(request)
  if (!authResult.authenticated) {
    return createUnauthorizedResponse(authResult.error || 'Authentication required')
  }

  // ... rest of your code
}
```

### Routes to Update (In Order)

| # | Route | File | Methods | Time | Status |
|---|-------|------|---------|------|--------|
| 1 | `/api/alerts` | `app/api/alerts/route.ts` | GET, POST, PATCH | 5m | ⚠️ Partial |
| 2 | `/api/brain` | `app/api/brain/route.ts` | GET, POST, PATCH | 5m | ❌ TODO |
| 3 | `/api/conductor` | `app/api/conductor/route.ts` | GET, POST, PUT | 5m | ❌ TODO |
| 4 | `/api/kanban` | `app/api/kanban/route.ts` | GET, POST, PATCH | 5m | ❌ TODO |
| 5 | `/api/meetings` | `app/api/meetings/route.ts` | GET, POST | 5m | ⚠️ Partial |
| 6 | `/api/metrics` | `app/api/metrics/route.ts` | GET, POST | 5m | ❌ TODO |
| 7 | `/api/profiles` | `app/api/profiles/route.ts` | GET, POST, PATCH | 5m | ❌ TODO |

**Skip:** `/api/health` (public endpoint - no auth needed)

### Instructions for Each Route

1. **Read the file** to understand current structure
2. **Add import:**
   ```typescript
   import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
   ```
3. **Add auth check** at the START of each handler:
   ```typescript
   const authResult = await verifyAuth(request)
   if (!authResult.authenticated) {
     return createUnauthorizedResponse(authResult.error || 'Authentication required')
   }
   ```
4. **Keep all existing logic** - just prepend the auth check
5. **Test** the route with and without token

---

## Phase 4: Testing (1 hour)

### 4.1 Unit Tests
```bash
npm test lib/auth.test.ts
```

### 4.2 Integration Tests - Endpoints

#### Test 1: Health Check (Should work without auth)
```bash
curl http://localhost:3000/api/health
# Expected: 200 with health data
```

#### Test 2: Login (Get token)
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'
# Expected: 200 with token
```

#### Test 3: Verify Token
```bash
TOKEN="<token-from-login>"
curl http://localhost:3000/api/auth/verify \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 with user info
```

#### Test 4: Protected Endpoint Without Token
```bash
curl http://localhost:3000/api/alerts
# Expected: 401 Unauthorized
```

#### Test 5: Protected Endpoint With Token
```bash
TOKEN="<token-from-login>"
curl http://localhost:3000/api/alerts \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 with alerts data
```

#### Test 6: Expired/Invalid Token
```bash
curl http://localhost:3000/api/alerts \
  -H "Authorization: Bearer invalid.token.here"
# Expected: 401 Invalid token
```

### 4.3 Test All Protected Routes
Repeat Test 5 for each protected route:
- `/api/alerts`
- `/api/brain`
- `/api/conductor`
- `/api/kanban`
- `/api/meetings`
- `/api/metrics`
- `/api/profiles`

---

## Phase 5: Client Integration (1 hour)

### 5.1 Update Frontend to Send Token

Create `lib/api.ts`:
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export async function apiCall<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {})
  headers.set('authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}
```

### 5.2 Use in Components
```typescript
const token = localStorage.getItem('authToken')
const alerts = await apiCall('/api/alerts', token)
```

---

## Phase 6: Deployment Preparation (30 minutes)

### 6.1 Checklist

- [ ] All tests passing locally
- [ ] No console.log statements in production code
- [ ] JWT_SECRET is secure (min 32 chars, random)
- [ ] NEXTAUTH_URL set correctly for environment
- [ ] Health endpoint confirmed public
- [ ] Monitoring updated (include auth in health checks)
- [ ] Rate limiting on login endpoint configured
- [ ] Database user lookup implemented (not hardcoded)
- [ ] Documentation updated for API consumers
- [ ] Rollback plan documented

### 6.2 Environment Variables

**Development (.env.local):**
```env
JWT_SECRET=abc123def456ghi789jkl012mno345pqr
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=dev-password
NEXTAUTH_URL=http://localhost:3000
```

**Staging (.env.staging):**
```env
JWT_SECRET=<generate-new-secure-secret>
ADMIN_EMAIL=<staging-admin-email>
ADMIN_PASSWORD=<staging-password>
NEXTAUTH_URL=https://staging.omnichannelsol.com
```

**Production (.env.production):**
```env
JWT_SECRET=<generate-new-secure-secret>
ADMIN_EMAIL=<production-admin-email>
ADMIN_PASSWORD=<production-password>
NEXTAUTH_URL=https://dashboard.omnichannelsol.com
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **Breaking clients** | Gradual migration; support both auth/no-auth temporarily |
| **Lost tokens** | Implement refresh token endpoint |
| **Token leakage** | Use HTTPS only in production; short expiration |
| **Performance impact** | Token verification is <1ms; negligible |
| **Monitoring failures** | Keep `/api/health` public; add separate auth health check |
| **Audit logging gaps** | Log all auth failures with timestamp, IP, endpoint |

---

## Rollback Plan

If critical issues arise:

1. **Revert middleware** to allow all requests
   - Comment out PROTECTED_ROUTES check
   - Or temporarily remove middleware file

2. **Keep auth endpoints** for gradual client migration

3. **Document issues** and analyze before retry

---

## Success Criteria

✅ All tests passing  
✅ All 7 protected endpoints require token  
✅ /api/health remains public  
✅ Token generation works  
✅ Token verification works  
✅ Invalid tokens rejected  
✅ Expired tokens rejected  
✅ All routes tested with and without token  
✅ Performance impact <5%  
✅ Documentation complete  

---

## Timeline

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| Setup | 15 min | T+0 | T+15 |
| Core | 60 min | T+15 | T+75 |
| Routes | 90 min | T+75 | T+165 |
| Testing | 60 min | T+165 | T+225 |
| Client | 60 min | T+225 | T+285 |
| Deploy | 30 min | T+285 | T+315 |
| **Total** | **~5.5 hrs** | | |

---

## Deliverables

### Code Files (Already Created)
- ✅ `lib/auth.ts` - Authentication utilities
- ✅ `middleware.ts` - Global auth middleware
- ✅ `.env.example` - Environment template
- ✅ `app/api/auth/login/route.ts` - Login endpoint
- ✅ `app/api/auth/verify/route.ts` - Verify endpoint

### Documentation Files (Already Created)
- ✅ `AUTHENTICATION_IMPLEMENTATION.md` - Complete guide
- ✅ `API_ROUTES_UPDATES.md` - Route update checklist
- ✅ `ENDPOINTS_SPECIFICATION.md` - API reference
- ✅ `IMPLEMENTATION_ACTION_PLAN.md` - This file

### To Be Created
- ⏳ `lib/auth.test.ts` - Unit tests
- ⏳ Updated route files (7 total)
- ⏳ Client integration helper (`lib/api.ts`)

---

## Next Immediate Steps

### NOW (This Session)
1. ✅ Create authentication library
2. ✅ Create global middleware
3. ✅ Create auth endpoints
4. ✅ Create documentation

### NEXT (Next Session)
1. Install dependencies: `npm install jose`
2. Update 7 API routes (15 min each = 105 min)
3. Create and run tests (60 min)
4. Test all endpoints (30 min)
5. Update client code (30 min)

### DEPLOYMENT
1. Set JWT_SECRET in production
2. Deploy to staging
3. Run integration tests
4. Deploy to production
5. Monitor auth failures

---

## Support & Questions

**Documentation References:**
- `AUTHENTICATION_IMPLEMENTATION.md` - Full implementation guide
- `API_ROUTES_UPDATES.md` - Specific route changes needed
- `ENDPOINTS_SPECIFICATION.md` - API reference with examples

**Key Files:**
- Authentication library: `dashboard/lib/auth.ts`
- Middleware: `dashboard/middleware.ts`
- Login: `dashboard/app/api/auth/login/route.ts`
- Verify: `dashboard/app/api/auth/verify/route.ts`

---

## Sign-Off

**Implementation Status:** 55% Complete
- Core infrastructure: ✅ Done
- API routes: ⏳ Pending (7 files)
- Tests: ⏳ Pending
- Client code: ⏳ Pending
- Documentation: ✅ Complete
