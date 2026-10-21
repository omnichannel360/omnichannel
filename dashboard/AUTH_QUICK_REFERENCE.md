# NextAuth.js Quick Reference Guide

**TL;DR** - Copy-paste patterns for protecting your API routes

## 1. Environment Setup (One-time)

```bash
# Generate secrets
openssl rand -base64 32 > .env.local

# Add to .env.local
NEXTAUTH_SECRET=<paste-secret>
JWT_SECRET=<same-secret>
NEXTAUTH_URL=http://localhost:3000
```

## 2. Protect a New API Route

### Pattern A: Basic Authentication

```typescript
// app/api/my-route/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response

  // Your code here
  return NextResponse.json({ success: true })
}
```

### Pattern B: Admin-Only Route

```typescript
import { verifyAuth, hasRole } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response
  
  if (!hasRole(request, ['admin'])) {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 })
  }

  return NextResponse.json({ success: true })
}
```

### Pattern C: With User Context

```typescript
import { getFullAuthContext, verifyAuth } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response
  
  const user = getFullAuthContext(request)
  console.log(`User ${user.userId} (${user.userRole}) accessed this`)

  return NextResponse.json({ userId: user.userId })
}
```

## 3. Generate Token for Testing

```bash
# Generate a test token
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "email": "test@example.com",
    "role": "user"
  }'

# Get token from response
# Use it in requests
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/my-route
```

## 4. Update Middleware for New Route

```typescript
// middleware-nextauth.ts

// Add to PROTECTED_ROUTES
const PROTECTED_ROUTES = [
  '/api/my-new-route',  // Add this
]

// Add to ROUTE_ACCESS_CONFIG (if you want role restrictions)
const ROUTE_ACCESS_CONFIG = {
  '/api/my-new-route': ['admin', 'user'],  // Add this
}
```

## 5. Permission Checking

```typescript
import { hasPermission } from '@/lib/auth-helpers'

// Available permissions by role:
// admin: read:all, write:all, delete:all, manage:users, manage:settings, view:analytics
// user: read:own, write:own, read:shared, create:content
// viewer: read:public, view:analytics:public

if (!hasPermission(request, 'write:all')) {
  return NextResponse.json({ error: 'Write permission required' }, { status: 403 })
}
```

## 6. Role Checking

```typescript
import { hasRole } from '@/lib/auth-helpers'

// Check for any of these roles
if (!hasRole(request, ['admin', 'user'])) {
  return NextResponse.json({ error: 'Access denied' }, { status: 403 })
}
```

## 7. Complete Route Example

```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, hasRole, getFullAuthContext } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  // Verify authenticated
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response

  // Get user info
  const user = getFullAuthContext(request)

  return NextResponse.json({
    success: true,
    user: {
      id: user.userId,
      email: user.userEmail,
      role: user.userRole,
    },
  })
}

export async function POST(request: NextRequest) {
  // Verify authenticated
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response

  // Check role
  if (!hasRole(request, ['admin'])) {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    )
  }

  const body = await request.json()
  // Process request...

  return NextResponse.json({ success: true }, { status: 201 })
}
```

## 8. Testing the Route

```bash
# 1. Get a token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","email":"test@example.com","role":"admin"}' \
  | jq -r '.data.accessToken')

# 2. Test GET
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/users

# 3. Test POST
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"John"}' \
  http://localhost:3000/api/users
```

## 9. Common Error Responses

```typescript
// Missing auth
// 401 Unauthorized
{ error: 'Authentication required' }

// Invalid token
// 401 Unauthorized
{ error: 'Invalid or expired token' }

// Insufficient role
// 403 Forbidden
{ error: 'Insufficient permissions. Required role: admin' }

// Missing permission
// 403 Forbidden
{ error: 'Missing required permission' }
```

## 10. Logging Auth Info

```typescript
import { getAuthContextForLogging } from '@/lib/auth-helpers'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const authContext = getAuthContextForLogging(request)
  
  logger.info('User accessed resource', {
    ...authContext,
    resource: 'my-route',
  })

  return NextResponse.json({ success: true })
}
```

## 11. Role-Based Data Filtering

```typescript
import { hasRole, getFullAuthContext } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  const auth = verifyAuth(request)
  if (!auth.authenticated) return auth.response

  const user = getFullAuthContext(request)
  let data = getAllData()

  // Filter based on role
  if (user.userRole === 'viewer') {
    data = data.filter(item => item.isPublic)
  } else if (user.userRole === 'user') {
    data = data.filter(item => item.userId === user.userId || item.isPublic)
  }
  // admins see everything

  return NextResponse.json({ data })
}
```

## 12. Checklist for New Route

- [ ] Add route handler (GET, POST, etc.)
- [ ] Import `verifyAuth` from '@/lib/auth-helpers'
- [ ] Call `verifyAuth(request)` at start
- [ ] Return error response if not authenticated
- [ ] Add role check if needed (`hasRole`)
- [ ] Add permission check if needed (`hasPermission`)
- [ ] Get user context (`getFullAuthContext`)
- [ ] Add to PROTECTED_ROUTES in middleware (if needed)
- [ ] Add to ROUTE_ACCESS_CONFIG with role requirements
- [ ] Test with valid token
- [ ] Test with invalid token
- [ ] Test with wrong role
- [ ] Verify logging works

## 13. Debugging Auth Issues

```typescript
// Debug: Log all auth headers
const authContext = getFullAuthContext(request)
console.log('Auth Debug:', {
  authenticated: authContext.isAuthenticated,
  userId: authContext.userId,
  userRole: authContext.userRole,
  correlationId: authContext.correlationId,
})

// Debug: Check if token is in header
const authHeader = request.headers.get('authorization')
console.log('Auth Header:', authHeader?.substring(0, 20) + '...')

// Debug: Verify role
console.log('Has admin?', hasRole(request, ['admin']))
console.log('Has permission?', hasPermission(request, 'write:all'))
```

## 14. Production Checklist

- [ ] Set NEXTAUTH_SECRET in production
- [ ] Set JWT_SECRET in production
- [ ] Update NEXTAUTH_URL to production domain
- [ ] Enable HTTPS
- [ ] Test all auth flows
- [ ] Configure monitoring
- [ ] Set up audit logging
- [ ] Review security headers
- [ ] Test rate limiting
- [ ] Verify token refresh works

## 15. Files Reference

| File | Purpose |
|------|---------|
| `auth.config.ts` | NextAuth configuration |
| `middleware-nextauth.ts` | Route protection |
| `lib/auth-helpers.ts` | Helper functions |
| `lib/auth.ts` | Token utils |
| `AUTH_SETUP_GUIDE.md` | Full documentation |
| `protected-route-example/route.ts` | Reference implementation |

---

**Need help?** Check `AUTH_SETUP_GUIDE.md` for full documentation.
