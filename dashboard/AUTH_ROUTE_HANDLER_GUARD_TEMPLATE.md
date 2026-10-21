# Auth Route Handler Guard Template

**Purpose:** Standardize authentication and authorization checks across all API route handlers  
**Status:** Template ready for implementation  
**Date:** 2026-10-22

---

## Template Pattern

Use this pattern in every GET/POST/PUT/DELETE handler:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { extractUserRole, canAccessRoute } from '@/lib/middleware-utils'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  // 1. RATE LIMITING CHECK
  const rateLimitError = await applyRateLimit(request, 'route-name')
  if (rateLimitError) return rateLimitError

  // 2. AUTH VERIFICATION
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    logger.warn('Unauthorized GET attempt', {
      method: 'GET',
      path: request.nextUrl.pathname,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Unauthorized')
  }

  // 3. EXTRACT USER CONTEXT FROM HEADERS
  // Middleware has already verified and injected these
  const userId = request.headers.get('x-user-id')
  const userEmail = request.headers.get('x-user-email')
  const userRole = request.headers.get('x-user-role') as 'admin' | 'user' | 'viewer'

  // 4. VALIDATE CONTEXT
  if (!userId || !userEmail || !userRole) {
    logger.error('Missing auth context in headers', {
      userId: !!userId,
      userEmail: !!userEmail,
      userRole: !!userRole,
    })
    return NextResponse.json(
      { success: false, error: 'Missing auth context' },
      { status: 500 }
    )
  }

  // 5. OPTIONAL: ADDITIONAL PERMISSION CHECKS
  // If needed, check specific permissions beyond role
  if (needsSpecialPermission && !hasRequiredPermission(userRole)) {
    logger.warn('Permission denied', {
      method: 'GET',
      path: request.nextUrl.pathname,
      userId,
      userRole,
    })
    return NextResponse.json(
      { success: false, error: 'Insufficient permissions' },
      { status: 403 }
    )
  }

  // 6. LOG SUCCESSFUL AUTH
  const startTime = Date.now()
  const logContext = {
    method: 'GET',
    path: request.nextUrl.pathname,
    userId,
    userRole,
    operation: 'operation_name',
  }

  try {
    // 7. PERFORM OPERATION
    const data = await performOperation()

    // 8. LOG SUCCESS
    logger.info('Operation successful', {
      ...logContext,
      duration: Date.now() - startTime,
      count: data.length,
    })

    // 9. RETURN RESPONSE
    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    // 10. LOG ERROR
    logger.error('Operation failed', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    })

    return NextResponse.json(
      { success: false, error: 'Operation failed' },
      { status: 500 }
    )
  }
}
```

---

## Routes to Update (11 Total)

### Protected Routes (7)

1. **`/api/alerts/route.ts`**
   - Required roles: admin, user
   - Current status: Partially protected ✅
   - Needed: Standardize error responses

2. **`/api/brain/route.ts`**
   - Required roles: admin, user
   - Current status: ⏳
   - Needed: Add auth guard

3. **`/api/conductor/route.ts`**
   - Required roles: admin, user
   - Current status: ⏳
   - Needed: Add auth guard

4. **`/api/kanban/route.ts`**
   - Required roles: admin, user
   - Current status: ⏳
   - Needed: Add auth guard

5. **`/api/meetings/route.ts`**
   - Required roles: admin, user
   - Current status: ⏳
   - Needed: Add auth guard

6. **`/api/metrics/route.ts`**
   - Required roles: admin, user, viewer
   - Current status: ⏳
   - Needed: Add auth guard + viewer role support

7. **`/api/profiles/route.ts`**
   - Required roles: admin, user
   - Current status: ⏳
   - Needed: Add auth guard

### Public Routes (2)

1. **`/api/health/route.ts`**
   - Public: Yes
   - Status: ✅ No changes needed

2. **`/api/auth/login/route.ts`**
   - Public: Yes (rate-limited)
   - Status: ⏳ Verify rate limiting

3. **`/api/auth/verify/route.ts`**
   - Public: Yes (rate-limited)
   - Status: ⏳ Verify rate limiting

4. **`/api/auth/route.ts`**
   - Public: Yes (rate-limited)
   - Status: ⏳ Verify rate limiting

---

## Guard Implementation Checklist

For each route, ensure:

- [ ] Rate limiting applied
- [ ] `verifyAuth()` called
- [ ] Return 401 if not authenticated
- [ ] Extract user context from headers
- [ ] Validate all context fields present
- [ ] Check additional permissions if needed
- [ ] Log authentication events
- [ ] Log operation success/failure
- [ ] Return consistent error format
- [ ] Test with valid token
- [ ] Test with invalid token
- [ ] Test with expired token
- [ ] Test with missing token

---

## Error Response Format

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Insufficient permissions"
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "error": "Too many requests"
}
```

### 500 Internal Error
```json
{
  "success": false,
  "error": "Operation failed"
}
```

---

## Logging Format

### Auth Success
```typescript
logger.info('Authentication successful', {
  method: 'GET',
  path: '/api/alerts',
  userId: 'user-123',
  userRole: 'admin',
  operation: 'list_alerts',
})
```

### Auth Failure
```typescript
logger.warn('Unauthorized access attempt', {
  method: 'GET',
  path: '/api/alerts',
  error: 'Missing or invalid token',
  timestamp: new Date().toISOString(),
})
```

### Permission Denied
```typescript
logger.warn('Permission denied', {
  method: 'DELETE',
  path: '/api/alerts',
  userId: 'user-123',
  userRole: 'viewer',
  requiredRoles: ['admin', 'user'],
})
```

---

## Import Statements

Add to every protected route:

```typescript
// Auth
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { extractUserRole } from '@/lib/middleware-utils'

// Rate limiting
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'

// Logging
import { logger } from '@/lib/logger'
```

---

## Testing Each Route

### Test 1: With Valid Token
```bash
curl -X GET http://localhost:3000/api/alerts \
  -H "Authorization: Bearer <valid-token>"
# Expected: 200 OK with data
```

### Test 2: Without Token
```bash
curl -X GET http://localhost:3000/api/alerts
# Expected: 401 Unauthorized
```

### Test 3: With Invalid Token
```bash
curl -X GET http://localhost:3000/api/alerts \
  -H "Authorization: Bearer invalid-token"
# Expected: 401 Unauthorized
```

### Test 4: With Expired Token
```bash
curl -X GET http://localhost:3000/api/alerts \
  -H "Authorization: Bearer <expired-token>"
# Expected: 401 Unauthorized
```

### Test 5: Wrong Role (if applicable)
```bash
curl -X GET http://localhost:3000/api/alerts \
  -H "Authorization: Bearer <viewer-token>"
# Expected: 403 Forbidden (if viewer doesn't have access)
```

---

## Common Issues & Solutions

### Issue: User context missing in handler
**Solution:** Verify middleware is injecting headers correctly
```typescript
// In middleware
requestHeaders.set('x-user-id', payload.sub)
requestHeaders.set('x-user-email', payload.email)
requestHeaders.set('x-user-role', payload.role)
```

### Issue: Double verification
**Solution:** Don't call verifyAuth in handler if middleware already did
**Use:** `request.headers.get('x-user-id')` instead

### Issue: Permissions not enforced
**Solution:** Add role check in handler
```typescript
const userRole = request.headers.get('x-user-role')
const requiredRoles = ['admin', 'user']
if (!requiredRoles.includes(userRole)) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

---

## Verification Script

Run this after implementing all guards:

```bash
#!/bin/bash
echo "Testing all protected routes..."

# Test 1: Health check (public)
curl -X GET http://localhost:3000/api/health

# Test 2: Login (public)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'

# Generate test token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"test"}' | jq -r '.token')

# Test 3: Protected routes with token
for route in alerts brain conductor kanban meetings metrics profiles; do
  echo "Testing /api/$route..."
  curl -X GET http://localhost:3000/api/$route \
    -H "Authorization: Bearer $TOKEN"
done

# Test 4: Protected routes without token (should fail)
curl -X GET http://localhost:3000/api/alerts \
  -w "\nStatus: %{http_code}\n"

echo "All tests completed!"
```

---

## Rollout Plan

1. **Phase 1:** Update `/api/alerts` as pilot (already partially protected)
2. **Phase 2:** Update remaining 6 protected routes
3. **Phase 3:** Verify all 11 routes in test environment
4. **Phase 4:** Run full test suite (80%+ coverage)
5. **Phase 5:** Security audit
6. **Phase 6:** Production deployment

---

## Contact & Support

**For questions:**  
Email: itsupport@omnichannelsol.com  
Session: omnicompany-70  
Date: 2026-10-22
