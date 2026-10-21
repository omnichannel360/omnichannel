# Auth Middleware Quick Start Guide

## 5-Minute Setup

### What Changed?
- ✅ New `middleware.ts` file protects all endpoints
- ✅ JWT tokens required for protected routes
- ✅ Auth context automatically injected to headers
- ✅ No manual auth checks needed in handlers

### Before (Old Way)
```typescript
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'

export async function GET(request: NextRequest) {
  // Manual auth check in every route
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error)
  }
  
  const userId = auth.payload?.sub
  // ... rest of handler
}
```

### After (New Way - Middleware Handles It)
```typescript
export async function GET(request: NextRequest) {
  // Auth is guaranteed valid - middleware already checked
  const userId = request.headers.get('x-user-id')
  const userEmail = request.headers.get('x-user-email')
  const userRole = request.headers.get('x-user-role')
  
  // ... rest of handler
}
```

---

## Protected Routes (Require Auth)
```
/api/alerts      ← Need valid JWT token
/api/brain       ← Need valid JWT token
/api/conductor   ← Need valid JWT token
/api/kanban      ← Need valid JWT token
/api/meetings    ← Need valid JWT token
/api/metrics     ← Need valid JWT token
/api/profiles    ← Need valid JWT token
```

## Public Routes (No Auth Required)
```
/api/health      ← No token needed
/api/auth        ← No token needed (token generation)
/api/auth/login  ← No token needed (login)
/api/auth/verify ← No token needed (token verification)
```

---

## Testing in 2 Minutes

### Test Without Token (Expect 401)
```bash
curl http://localhost:3000/api/alerts
# Response: 401 Unauthorized
```

### Generate a Token
```bash
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "email": "user@example.com",
    "role": "user"
  }'

# Response:
# {
#   "accessToken": "eyJhbGc...",
#   "expiresIn": 86400,
#   "tokenType": "Bearer"
# }
```

### Test With Token (Expect 200)
```bash
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:3000/api/alerts
# Response: 200 OK with data
```

---

## Refactoring One Endpoint

### Example: `/api/alerts` GET handler

#### BEFORE (Old Implementation)
```typescript
// dashboard/app/api/alerts/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { atomicRead } from '@/lib/atomic-file-ops'

export async function GET(request: NextRequest) {
  // Step 1: Verify auth manually
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Unauthorized')
  }

  // Step 2: Access user info from auth payload
  const userId = auth.payload?.sub
  const userEmail = auth.payload?.email

  // Step 3: Read alerts
  const alerts = await atomicRead('./data/alerts.json', [])

  return NextResponse.json({ alerts })
}
```

#### AFTER (New Implementation with Middleware)
```typescript
// dashboard/app/api/alerts/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { atomicRead } from '@/lib/atomic-file-ops'

export async function GET(request: NextRequest) {
  // Step 1: Auth already verified by middleware
  // Step 2: Get user info from headers injected by middleware
  const userId = request.headers.get('x-user-id')
  const userEmail = request.headers.get('x-user-email')

  // Step 3: Read alerts
  const alerts = await atomicRead('./data/alerts.json', [])

  return NextResponse.json({ alerts })
}
```

### What Was Removed?
- ❌ `verifyAuth()` call (middleware does it)
- ❌ Auth check and error return (middleware does it)
- ❌ `createUnauthorizedResponse()` (middleware does it)

### What Was Added?
- ✅ `request.headers.get('x-user-id')`
- ✅ `request.headers.get('x-user-email')`
- ✅ `request.headers.get('x-user-role')`

### Code Reduction
- **Before:** 12 lines for auth handling
- **After:** 2 lines for auth extraction
- **Reduction:** ~83% less auth boilerplate per endpoint

---

## TypeScript Types

### Auth Context Headers

```typescript
interface AuthContext {
  userId: string         // from x-user-id header
  userEmail: string      // from x-user-email header
  userRole: string       // from x-user-role header
  verified: boolean      // x-auth-verified === 'true'
}

// Helper function to extract auth context
function getAuthContext(request: NextRequest): AuthContext {
  return {
    userId: request.headers.get('x-user-id') || '',
    userEmail: request.headers.get('x-user-email') || '',
    userRole: request.headers.get('x-user-role') || '',
    verified: request.headers.get('x-auth-verified') === 'true',
  }
}

// Usage in handler
export async function GET(request: NextRequest) {
  const auth = getAuthContext(request)
  const userId = auth.userId
  // ...
}
```

---

## Common Patterns

### Pattern 1: Require Specific Role

```typescript
export async function DELETE(request: NextRequest) {
  const userRole = request.headers.get('x-user-role')
  
  // Only admins can delete
  if (userRole !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    )
  }

  // ... delete logic
}
```

### Pattern 2: Audit Log with User Info

```typescript
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  const userEmail = request.headers.get('x-user-email')
  
  const data = await request.json()
  
  // Create audit log
  logger.info('User created alert', {
    userId,
    userEmail,
    alertData: data,
  })

  // ... rest of handler
}
```

### Pattern 3: User-Scoped Data

```typescript
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  
  // Only return data for current user
  const userData = await atomicRead(
    `./data/users/${userId}.json`,
    {}
  )

  return NextResponse.json(userData)
}
```

---

## Environment Setup

### 1. Verify JWT_SECRET

```bash
# Check if set
echo $JWT_SECRET

# If empty, set it
export JWT_SECRET="your-secret-key-here"
```

### 2. Verify middleware.ts Exists

```bash
ls -la dashboard/middleware.ts
# Should output the file details
```

### 3. Run Tests

```bash
npm test middleware.test.ts
# Should pass all 25+ tests
```

---

## Troubleshooting

### Error: "Missing or malformed Authorization header"
**Solution:** Add the header in your request
```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/alerts
```

### Error: "Token verification failed"
**Solution:** Token is invalid or expired. Generate a new one from `/api/auth`

### Error: "x-user-id is undefined"
**Solution:** Make sure you're reading from request headers, not the body
```typescript
const userId = request.headers.get('x-user-id')  // ✅ Correct
// NOT: const userId = await request.json().userId  // ❌ Wrong
```

### Error: "JWT_SECRET not configured"
**Solution:** Set the environment variable
```bash
export JWT_SECRET="your-secret"
```

---

## Token Examples

### Token Structure
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Payload (decoded)
```json
{
  "sub": "user-123",
  "email": "user@example.com",
  "role": "admin",
  "iat": 1634567890,
  "exp": 1634654290
}
```

### Generate Token (cURL)
```bash
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "email": "user@example.com",
    "role": "admin"
  }' \
  | jq -r '.accessToken'
```

---

## Migration Checklist

- [ ] Read `AUTH_MIDDLEWARE_FIX_SUMMARY.md`
- [ ] Run `npm test middleware.test.ts`
- [ ] Verify all tests pass
- [ ] Choose one endpoint to refactor
- [ ] Remove manual auth checks from handler
- [ ] Update tests for that endpoint
- [ ] Test with valid token
- [ ] Test without token (expect 401)
- [ ] Repeat for other endpoints
- [ ] Run full test suite
- [ ] Deploy to staging
- [ ] Verify in production

---

## FAQ

### Q: Do I need to update all endpoints at once?
**A:** No, you can do it gradually. Middleware protects all routes. Old manual auth checks will still work.

### Q: What if my endpoint was public before?
**A:** Check `AUTH_MIDDLEWARE_FIX_SUMMARY.md` for the public routes list. Only routes in the protected list need tokens.

### Q: Can I add new protected routes?
**A:** Yes, add them to `PROTECTED_ROUTES` in `middleware.ts` and they'll automatically require auth.

### Q: How do I test this locally?
**A:** Use the cURL examples above, or use a tool like Postman to add the Authorization header.

### Q: Where is the token stored?
**A:** In the Authorization header. Frontend should save it after login and include it in all subsequent requests.

### Q: How do I refresh an expired token?
**A:** POST to `/api/auth/verify` with your refresh token to get a new access token.

### Q: Can middleware be disabled?
**A:** Yes, but don't. Instead, add routes to `PUBLIC_ROUTES` if they shouldn't require auth.

---

## Key Files

| File | Purpose |
|------|---------|
| `dashboard/middleware.ts` | Main middleware (protects all endpoints) |
| `dashboard/middleware.test.ts` | Test cases (25+ tests) |
| `dashboard/lib/auth.ts` | Token generation and verification |
| `dashboard/AUTH_MIDDLEWARE_FIX_SUMMARY.md` | Complete implementation details |
| `dashboard/AUTH_MIDDLEWARE_IMPLEMENTATION.md` | Detailed guide with examples |

---

## Support

For issues:
1. Check `AUTH_MIDDLEWARE_FIX_SUMMARY.md` troubleshooting section
2. Run `npm test middleware.test.ts` to verify setup
3. Check JWT_SECRET is set: `echo $JWT_SECRET`
4. Review middleware.ts for route classifications
5. Check auth header format: `Authorization: Bearer TOKEN`

---

**Status:** Ready to use
**Last Updated:** 2026-10-22
**Test Coverage:** 25+ test cases
**Documentation:** Complete
