# API Route Migration Guide - NextAuth.js Implementation

Guide for migrating existing API routes to use the new NextAuth.js authentication system.

## Overview

This guide helps you update existing API routes to use the new authentication helpers. The migration is straightforward and backwards compatible.

## Before & After Examples

### Example 1: Simple GET Route

#### Before (Without Auth)
```typescript
// app/api/alerts/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const alerts = await fetchAlerts()
  return NextResponse.json({ alerts })
}
```

#### After (With NextAuth)
```typescript
// app/api/alerts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  // Add this: Verify authentication
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response

  const alerts = await fetchAlerts()
  return NextResponse.json({ alerts })
}
```

**Changes**: 2 lines added

---

### Example 2: POST Route with Admin Check

#### Before (Without Auth)
```typescript
// app/api/metrics/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const metric = await createMetric(body)
  return NextResponse.json({ metric }, { status: 201 })
}
```

#### After (With NextAuth)
```typescript
// app/api/metrics/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, hasRole } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  // Add this: Verify authentication
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response

  // Add this: Check for admin role
  if (!hasRole(request, ['admin'])) {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    )
  }

  const body = await request.json()
  const metric = await createMetric(body)
  return NextResponse.json({ metric }, { status: 201 })
}
```

**Changes**: 8 lines added

---

### Example 3: Using User Context

#### Before (Without Auth)
```typescript
// app/api/profiles/route.ts
export async function GET(request: NextRequest) {
  const profiles = await fetchAllProfiles()
  return NextResponse.json({ profiles })
}
```

#### After (With NextAuth)
```typescript
// app/api/profiles/route.ts
import { verifyAuth, getFullAuthContext } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response

  const user = getFullAuthContext(request)
  
  // Filter profiles based on user role
  let profiles = await fetchAllProfiles()
  if (user.userRole === 'user') {
    profiles = profiles.filter(p => p.userId === user.userId || p.isPublic)
  }
  
  return NextResponse.json({ profiles })
}
```

**Changes**: 8 lines added

---

## Migration Steps

### Step 1: Add Imports

Add these imports to each API route file:

```typescript
import { verifyAuth } from '@/lib/auth-helpers'
// OR
import { verifyAuth, hasRole, hasPermission, getFullAuthContext } from '@/lib/auth-helpers'
```

### Step 2: Add Auth Verification

At the start of each route handler, add:

```typescript
export async function GET(request: NextRequest) {
  // Step 1: Verify authentication
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response

  // Rest of your code...
}
```

### Step 3: Add Role Checks (if needed)

If the route is admin-only:

```typescript
if (!hasRole(request, ['admin'])) {
  return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
}
```

### Step 4: Update Middleware Configuration

Update `middleware-nextauth.ts`:

```typescript
// Add your route to PROTECTED_ROUTES
const PROTECTED_ROUTES = [
  '/api/your-new-route',
]

// Add role requirements to ROUTE_ACCESS_CONFIG
const ROUTE_ACCESS_CONFIG = {
  '/api/your-new-route': ['admin', 'user'],  // specify roles
}
```

### Step 5: Test the Route

```bash
# Generate token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","email":"test@example.com","role":"admin"}' \
  | jq -r '.data.accessToken')

# Test route
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/your-route
```

## Migration Checklist

For each API route:

- [ ] Add imports from `@/lib/auth-helpers`
- [ ] Add `verifyAuth()` call at the start
- [ ] Return error response if not authenticated
- [ ] Add `hasRole()` check if role-specific
- [ ] Add `hasPermission()` check if permission-specific
- [ ] Add to PROTECTED_ROUTES in middleware
- [ ] Add to ROUTE_ACCESS_CONFIG with role requirements
- [ ] Test with valid token
- [ ] Test with invalid token
- [ ] Test with wrong role
- [ ] Verify error responses
- [ ] Check logging

## Common Patterns

### Pattern 1: User-Only Route

```typescript
export async function GET(request: NextRequest) {
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response

  if (!hasRole(request, ['admin', 'user'])) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  return NextResponse.json({ data: 'user data' })
}
```

### Pattern 2: Admin-Only Route

```typescript
export async function POST(request: NextRequest) {
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response

  if (!hasRole(request, ['admin'])) {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 })
  }

  return NextResponse.json({ success: true })
}
```

### Pattern 3: Multi-Role Route

```typescript
export async function DELETE(request: NextRequest) {
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response

  const user = getFullAuthContext(request)

  // Admin can delete anything, users can only delete their own
  if (user.userRole === 'admin') {
    // Allow
  } else if (user.userRole === 'user') {
    const itemUserId = request.nextUrl.searchParams.get('userId')
    if (itemUserId !== user.userId) {
      return NextResponse.json({ error: 'Can only delete your own items' }, { status: 403 })
    }
  } else {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  return NextResponse.json({ success: true })
}
```

### Pattern 4: Logging User Actions

```typescript
import { getAuthContextForLogging } from '@/lib/auth-helpers'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response

  const authContext = getAuthContextForLogging(request)

  logger.info('User performed action', {
    ...authContext,
    action: 'created_item',
  })

  return NextResponse.json({ success: true })
}
```

## API Routes to Migrate

Priority order for migration:

### Priority 1: Core Protected Routes (Must Have)
- [ ] `/api/alerts` - Alert management
- [ ] `/api/brain` - Brain operations
- [ ] `/api/conductor` - Conductor operations
- [ ] `/api/kanban` - Kanban board operations
- [ ] `/api/meetings` - Meeting management
- [ ] `/api/metrics` - Metrics collection
- [ ] `/api/profiles` - User profiles

### Priority 2: Public Routes (Already Protected)
- [ ] `/api/health` - Already public
- [ ] `/api/health/check` - Already public

### Priority 3: Auth Routes (Already Implemented)
- [ ] `/api/auth` - Already implemented
- [ ] `/api/auth/login` - Already implemented
- [ ] `/api/auth/verify` - Already implemented

### Priority 4: New Routes
- [ ] Add new routes as needed
- [ ] Always add auth protection

## Handling Different Response Formats

### If Your Route Uses Custom Response Format

```typescript
// Before
export async function GET(request: NextRequest) {
  const data = await fetchData()
  return NextResponse.json({
    data: data,
    timestamp: new Date().toISOString(),
  })
}

// After
export async function GET(request: NextRequest) {
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response

  const data = await fetchData()
  return NextResponse.json({
    data: data,
    timestamp: new Date().toISOString(),
  })
}
```

The auth check doesn't require changing your response format.

## Backwards Compatibility

The migration is backwards compatible:

- ✅ Existing error handling still works
- ✅ Custom response formats preserved
- ✅ Logging patterns unchanged
- ✅ Request/response structure unchanged
- ✅ Only authentication is added

## Testing Migration

### Unit Tests

```typescript
import { verifyAuth } from '@/lib/auth-helpers'
import { NextRequest } from 'next/server'

describe('Protected Route', () => {
  it('should reject unauthenticated requests', async () => {
    const request = new NextRequest('http://localhost:3000/api/test')
    const auth = verifyAuth(request)
    
    expect(auth.authenticated).toBe(false)
    expect(auth.response?.status).toBe(401)
  })

  it('should accept authenticated requests', async () => {
    const request = new NextRequest('http://localhost:3000/api/test')
    request.headers.set('x-auth-verified', 'true')
    request.headers.set('x-user-id', 'user-123')
    request.headers.set('x-user-role', 'admin')
    
    const auth = verifyAuth(request)
    expect(auth.authenticated).toBe(true)
  })
})
```

### Integration Tests

```bash
# Test without token
curl http://localhost:3000/api/test
# Expected: 401 Unauthorized

# Test with token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","email":"test@example.com","role":"admin"}' \
  | jq -r '.data.accessToken')

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/test
# Expected: 200 OK
```

## Rollback Plan

If you need to rollback a migrated route:

1. Remove auth verification lines
2. Remove helper imports
3. Test the route works without auth
4. Remove from PROTECTED_ROUTES in middleware
5. Remove from ROUTE_ACCESS_CONFIG

The changes are minimal and easily reversible.

## Performance Impact

Migration adds minimal overhead:

| Operation | Time | Notes |
|-----------|------|-------|
| verifyAuth() | ~1ms | Header parsing |
| hasRole() | <1ms | Role comparison |
| getFullAuthContext() | <1ms | Header extraction |
| **Total per request** | ~2ms | Negligible |

No performance concerns for high-traffic routes.

## Security Best Practices

After migration:

- ✅ Always verify authentication first
- ✅ Check roles before sensitive operations
- ✅ Use permission checks for fine-grained access
- ✅ Log all privileged operations
- ✅ Use correlation IDs for tracing
- ✅ Never expose internal errors to client
- ✅ Validate all input after auth check
- ✅ Rate limit sensitive endpoints

## Questions & Troubleshooting

### Q: Do I need to update every route?

**A**: No. Only routes in PROTECTED_ROUTES need updates. Public health check routes don't need changes.

### Q: What if my route has custom logic?

**A**: Add auth check at the start, rest of logic stays unchanged.

### Q: How do I handle nested routes?

**A**: Same pattern - add auth check at the start of each handler.

### Q: Can I use the old auth system?

**A**: Yes, both systems work together during migration. But migrate all routes eventually.

### Q: What if token verification fails?

**A**: `verifyAuth()` returns error response automatically. Just return it to client.

## Support

- **Full Documentation**: `AUTH_SETUP_GUIDE.md`
- **Quick Reference**: `AUTH_QUICK_REFERENCE.md`
- **Example Route**: `app/api/protected-route-example/route.ts`
- **Status Report**: `NEXTAUTH_IMPLEMENTATION_STATUS.md`

---

**Start with 1-2 routes to get comfortable, then migrate the rest!**
