# API Routes Authentication Updates

## Summary
All protected API routes need the authentication check at the beginning of each handler function.

---

## Pattern for All Protected Routes

```typescript
// Add this import at the top
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'

// Add this check in every handler (GET, POST, PATCH, PUT, DELETE)
export async function GET(request: NextRequest) {
  // ALWAYS add auth check FIRST
  const authResult = await verifyAuth(request)
  if (!authResult.authenticated) {
    return createUnauthorizedResponse(authResult.error || 'Authentication required')
  }

  // Your existing logic continues...
}
```

---

## Files to Update

### 1. `/api/brain/route.ts`
**Status:** ❌ Needs auth
**Methods:** GET, POST, PATCH
**Add import:** `import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'`
**Add check:** At start of GET, POST, PATCH handlers

### 2. `/api/conductor/route.ts`
**Status:** ❌ Needs auth
**Methods:** GET, POST, PUT
**Add import:** `import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'`
**Add check:** At start of GET, POST, PUT handlers

### 3. `/api/kanban/route.ts`
**Status:** ❌ Needs auth
**Methods:** GET, POST, PATCH
**Add import:** `import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'`
**Add check:** At start of GET, POST, PATCH handlers

### 4. `/api/meetings/route.ts`
**Status:** ❌ Needs auth (partially done)
**Methods:** GET, POST
**Add import:** `import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'`
**Add check:** At start of GET, POST handlers

### 5. `/api/metrics/route.ts`
**Status:** ❌ Needs auth
**Methods:** GET, POST
**Add import:** `import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'`
**Add check:** At start of GET, POST handlers

### 6. `/api/profiles/route.ts`
**Status:** ❌ Needs auth
**Methods:** GET, POST, PATCH
**Add import:** `import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'`
**Add check:** At start of GET, POST, PATCH handlers

### 7. `/api/health/route.ts`
**Status:** ✅ SKIP - Public endpoint (no auth needed)

### 8. `/api/alerts/route.ts`
**Status:** ⚠️ Partially done - Has auth checks but has bad import
**Fix:** Remove `import { protectRoute } from '@/lib/middleware'` (line 4)

---

## Implementation Order

**Priority 1 (Critical):**
1. Ensure `lib/auth.ts` is correct
2. Ensure `middleware.ts` is correct
3. Fix `/api/alerts/route.ts` (remove bad import)

**Priority 2 (All Protected):**
4. `/api/brain/route.ts`
5. `/api/conductor/route.ts`
6. `/api/kanban/route.ts`
7. `/api/meetings/route.ts`
8. `/api/metrics/route.ts`
9. `/api/profiles/route.ts`

---

## Verification Checklist

After updating each route:

- [ ] Import added: `import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'`
- [ ] Auth check added at start of EVERY handler
- [ ] Returns 401 with error message if not authenticated
- [ ] Original logic unchanged (only prepended auth check)
- [ ] No `console.log` statements in production code
- [ ] TypeScript types are correct

---

## Testing Commands

```bash
# Install dependencies
npm install jose

# Verify auth works
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'

# Test protected endpoint WITHOUT token (should fail)
curl http://localhost:3000/api/alerts

# Test protected endpoint WITH token (should work)
TOKEN="<token-from-login>"
curl http://localhost:3000/api/alerts \
  -H "Authorization: Bearer $TOKEN"

# Test public health endpoint (should always work)
curl http://localhost:3000/api/health
```

---

## Example: Before and After

### BEFORE (No Auth)
```typescript
export async function GET(request: NextRequest) {
  const data = loadData()
  return NextResponse.json({ success: true, data })
}
```

### AFTER (With Auth)
```typescript
export async function GET(request: NextRequest) {
  // ← ADD THIS CHECK
  const authResult = await verifyAuth(request)
  if (!authResult.authenticated) {
    return createUnauthorizedResponse(authResult.error || 'Authentication required')
  }
  
  const data = loadData()
  return NextResponse.json({ success: true, data })
}
```

---

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Import error `@/lib/middleware not found` | Remove that import; use `@/lib/auth` instead |
| 401 errors on all requests | Check JWT_SECRET is set in .env |
| Token expired immediately | Verify token expiration time (should be 24h) |
| CORS errors from frontend | Add CORS headers in middleware or route |
| `authResult.payload is undefined` | Check token contains required fields (sub, email, role) |

---

## Next Steps

1. ✅ Created `AUTHENTICATION_IMPLEMENTATION.md` with full guide
2. ⏳ Update all 7 API routes (in order listed above)
3. ⏳ Run full test suite
4. ⏳ Test all endpoints with and without auth
5. ⏳ Deploy to staging
6. ⏳ Verify health checks still work in monitoring
7. ⏳ Update client code to send Authorization header
8. ⏳ Deploy to production with new JWT_SECRET
