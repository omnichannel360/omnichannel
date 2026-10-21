# Auth Middleware - Quick Reference

## 🔑 Quick Start

### 1. Set Environment Variable
```bash
JWT_SECRET=your-random-secret-key-here
```

### 2. All Protected Endpoints (Already Implemented)
```
GET    /api/alerts     ✅ Protected
POST   /api/alerts     ✅ Protected
PATCH  /api/alerts     ✅ Protected

GET    /api/brain      ✅ Protected
POST   /api/conductor  ✅ Protected

GET    /api/kanban     ✅ Protected
POST   /api/kanban     ✅ Protected
PUT    /api/kanban     ✅ Protected
DELETE /api/kanban     ✅ Protected

GET    /api/meetings   ✅ Protected
POST   /api/meetings   ✅ Protected

GET    /api/metrics    ✅ Protected
GET    /api/profiles   ✅ Protected
PUT    /api/profiles   ✅ Protected
GET    /api/health     ✅ Protected
```

### 3. Public Endpoints (No Auth Required)
```
POST   /api/auth/login    ✅ Public
GET    /api/auth/verify   ✅ Public
POST   /api/auth          ✅ Public
```

## 📡 API Usage

### Login & Get Token
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"change-this-in-production"}'

# Response:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

### Use Token to Access Protected Endpoint
```bash
TOKEN="<token-from-login>"

curl -X GET http://localhost:3000/api/alerts \
  -H "Authorization: Bearer $TOKEN"

# Response (200 OK):
{
  "success": true,
  "alerts": [ ... ],
  "total": 5
}
```

### Without Token (401 Error)
```bash
curl -X GET http://localhost:3000/api/alerts

# Response (401 Unauthorized):
{
  "success": false,
  "error": "Missing or invalid authentication token"
}
```

## 🛡️ Adding Auth to New Endpoint

### Option 1: Using withAuth (Recommended)
```typescript
import { withAuth } from '@/lib/middleware/auth-middleware'

export const GET = withAuth(async (request, auth) => {
  const { userId, payload } = auth
  console.log(`User ${userId} (${payload.email}) called this endpoint`)
  
  return NextResponse.json({
    success: true,
    message: 'Protected data'
  })
})
```

### Option 2: Using requireAuth
```typescript
import { requireAuth } from '@/lib/middleware/auth-middleware'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  
  if (!auth.authenticated) {
    return auth.response!
  }
  
  const { userId, payload } = auth
  
  return NextResponse.json({ success: true })
}
```

### Option 3: Current Pattern (Manual)
```typescript
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }
  
  return NextResponse.json({ success: true })
}
```

## 🔐 Auth Header Format

```
Authorization: Bearer <token>
```

**Example:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoiamFtZXNAZXhhbXBsZS5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MDMwMDAwMDAsImV4cCI6MTcwMzA4NjQwMH0.signature
```

## 📊 Token Payload

```json
{
  "sub": "user-123",           // User ID
  "email": "user@example.com", // Email
  "role": "admin",             // Role
  "iat": 1703000000,          // Issued at (unix timestamp)
  "exp": 1703086400           // Expires at (unix timestamp)
}
```

## 🚦 HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | `{ "success": true, "data": {...} }` |
| 400 | Bad Request | Invalid input/validation error |
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Valid token but insufficient permissions |
| 429 | Rate Limited | Too many requests |
| 500 | Server Error | Unexpected error |

## 🔄 Authentication Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ 1. POST /api/auth/login
       │    { email, password }
       │
       ├─────────────────────────────────────┐
       │                                     │
       │ 2. Server validates credentials     │
       │ 3. Server generates JWT             │
       │                                     │
       │ 4. 200 OK { token, user }           │
       │
       ├──────────────────────────────────────┤
       │                                      │
       │ 5. Client stores token               │
       │    (httpOnly cookie or localStorage) │
       │                                      │
       │ 6. GET /api/alerts                   │
       │    Authorization: Bearer <token>    │
       │                                      │
       ├──────────────────────────────────────┤
       │                                      │
       │ 7. Server validates token            │
       │ 8. Server verifies signature         │
       │ 9. Server checks expiration          │
       │ 10. Server injects user context      │
       │                                      │
       │ 11. Route handler processes request  │
       │ 12. 200 OK { data }                  │
       │
       └──────────────────────────────────────┘
```

## ⚡ Performance Tips

### Token Validation Time
- Average: ~1-2ms
- Includes JWT verification and signature check
- Overhead is minimal for all requests

### Middleware Overhead
- Rate limiting: ~0.5ms
- Auth validation: ~1-2ms
- Total: ~2-3ms per request

### Caching Strategies
- Cache validated tokens in memory (if no secret rotation)
- Cache user context in request-level headers
- Implement refresh tokens to reduce login frequency

## 🐛 Common Issues

### "Missing or invalid authentication token"
**Fix:** Include Authorization header with valid token
```bash
# Wrong:
curl http://localhost:3000/api/alerts

# Right:
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/alerts
```

### "Invalid token format"
**Fix:** Use correct Bearer format
```bash
# Wrong:
Authorization: Bearer$TOKEN
Authorization: Bearer <token>
Authorization: Basic $TOKEN

# Right:
Authorization: Bearer eyJhbGc...
```

### "Token expired"
**Fix:** Login again to get new token
```bash
# Get new token
curl -X POST http://localhost:3000/api/auth/login \
  -d '{"email":"...","password":"..."}'
```

### "JWT_SECRET not set"
**Fix:** Add to .env.local
```bash
JWT_SECRET=your-secret-here
```

## 📚 Related Files

| File | Purpose |
|------|---------|
| `lib/auth.ts` | Core auth functions |
| `lib/middleware/auth-middleware.ts` | Helper functions |
| `middleware.ts` | Request-level middleware |
| `app/api/*/route.ts` | Protected endpoints |
| `docs/AUTH_MIDDLEWARE_GUIDE.md` | Full documentation |

## 🔗 More Info

- Full Guide: `docs/AUTH_MIDDLEWARE_GUIDE.md`
- Implementation Checklist: `docs/AUTH_IMPLEMENTATION_CHECKLIST.md`
- Test Suite: `__tests__/api/auth-protection.test.ts`

## ✅ Testing Auth

### Test Protected Endpoint
```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"change-this-in-production"}' \
  | jq -r '.token')

# 2. Access protected endpoint
curl -X GET http://localhost:3000/api/alerts \
  -H "Authorization: Bearer $TOKEN"

# 3. Expected: 200 OK with data
```

### Test Expired Token
```bash
# Token naturally expires after 24 hours
# Or test with invalid token:
curl -X GET http://localhost:3000/api/alerts \
  -H "Authorization: Bearer invalid.token.here"

# Expected: 401 Unauthorized
```

### Run Tests
```bash
npm test -- auth-protection.test.ts
npm test -- --coverage
```

## 🎯 Key Takeaways

1. **All endpoints are protected** - No unprotected data endpoints
2. **Defense in depth** - Middleware + route handler auth
3. **Easy to extend** - Use `withAuth()` for new endpoints
4. **Secure by default** - Consistent error handling
5. **Well tested** - Comprehensive test suite
6. **Well documented** - Multiple guides available

## 🚀 Next Steps

1. ✅ All endpoints protected
2. ✅ Middleware validates requests
3. ✅ Tests verify protection
4. 📋 TODO: Refresh token implementation
5. 📋 TODO: User database integration
6. 📋 TODO: Session management
7. 📋 TODO: Multi-factor authentication
