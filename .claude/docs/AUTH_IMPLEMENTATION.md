# Auth Middleware Implementation Guide

**Last Updated**: October 22, 2026  
**Version**: 1.0 - Unified Auth Pattern  

---

## Quick Start

### Protecting a Single-Method Route (GET only)

```typescript
import { protectRoute } from '@/lib/protected-route'

export const GET = protectRoute(
  async (request: NextRequest, { userId, email, role }) => {
    // Your handler logic here - auth is already verified
    return NextResponse.json({ success: true, data: 'protected' })
  },
  { requireAuth: true }
)
```

### Protecting a Multi-Method Route (GET, POST, PUT, DELETE)

```typescript
import { protectRouteMulti } from '@/lib/protected-route'

const handlers = protectRouteMulti(
  {
    GET: async (request, { userId }) => {
      return NextResponse.json({ success: true })
    },
    POST: async (request, { userId }) => {
      return NextResponse.json({ success: true }, { status: 201 })
    },
    PUT: async (request, { userId }) => {
      return NextResponse.json({ success: true })
    },
    DELETE: async (request, { userId }) => {
      return NextResponse.json({ success: true })
    },
  },
  { requireAuth: true }
)

export const { GET, POST, PUT, DELETE } = handlers
```

---

## How It Works

### 3-Layer Authentication Architecture

```
┌─────────────────────────────────────────────┐
│ 1. CLIENT: Sends JWT in Authorization header│
└────────────────┬────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────┐
│ 2. MIDDLEWARE (middleware.ts)                │
│    • Validates JWT signature                │
│    • Checks token expiration                │
│    • Enforces RBAC (role-based access)      │
│    • Injects headers: x-user-id, x-user-*  │
│    → Returns 401 if auth fails              │
│    → Returns 403 if insufficient role       │
└────────────────┬────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────┐
│ 3. ROUTE HANDLER (protectRoute wrapper)      │
│    • Extracts verified context from headers │
│    • Passes {userId, email, role} param     │
│    • Calls your handler logic               │
│    • Handler can assume auth is valid       │
└─────────────────────────────────────────────┘
```

---

## Available Context Variables

When your handler is called, you receive an object with:

```typescript
interface RouteContext {
  userId: string       // JWT 'sub' claim - unique user ID
  email: string        // JWT 'email' claim - user email
  role: string         // JWT 'role' claim - 'admin' | 'user' | 'viewer'
}
```

### Example: Using Context

```typescript
export const GET = protectRoute(
  async (request, { userId, email, role }) => {
    console.log(`User ${email} (${userId}) accessed this endpoint`)
    
    // Check permissions if needed
    if (role === 'viewer') {
      // Viewers can only read
      return NextResponse.json({ success: true, data: 'read-only' })
    }
    
    // Admins and users can do more
    return NextResponse.json({ success: true, data: 'full-access' })
  },
  { requireAuth: true }
)
```

---

## Error Responses

### Unauthorized (401) - Missing or Invalid JWT

```json
{
  "success": false,
  "error": "Authentication required"
}
```

Returned by middleware when:
- No Authorization header provided
- Authorization header missing "Bearer " prefix
- JWT signature is invalid
- JWT is expired

### Forbidden (403) - Insufficient Role

```json
{
  "success": false,
  "error": "Insufficient permissions. Required role: admin or user"
}
```

Returned by middleware when:
- User has valid JWT
- But user's role doesn't have access to this endpoint

### Protected Routes by Role

| Endpoint | Admin | User | Viewer | Notes |
|----------|:-----:|:----:|:------:|-------|
| `/api/alerts` | ✓ | ✓ | ✗ | Alert creation |
| `/api/brain` | ✓ | ✓ | ✗ | Memory queries |
| `/api/conductor` | ✓ | ✓ | ✗ | Task dispatch |
| `/api/kanban` | ✓ | ✓ | ✗ | Task management |
| `/api/meetings` | ✓ | ✓ | ✗ | Meeting logs |
| `/api/metrics` | ✓ | ✓ | ✓ | Read-only metrics |
| `/api/profiles` | ✓ | ✓ | ✗ | Profile access |

---

## Common Patterns

### Pattern 1: Extract User ID for Logging

```typescript
export const POST = protectRoute(
  async (request, { userId }) => {
    const startTime = Date.now()
    try {
      // Create resource
      const result = await createResource(...)
      
      logger.info('Resource created', {
        userId,
        resourceId: result.id,
        duration: Date.now() - startTime,
      })
      
      return NextResponse.json({ success: true, data: result }, { status: 201 })
    } catch (error) {
      logger.error('Resource creation failed', error, { userId })
      return NextResponse.json({ success: false, error: 'Creation failed' }, { status: 500 })
    }
  },
  { requireAuth: true }
)
```

### Pattern 2: Rate Limiting Per User

```typescript
export const GET = protectRoute(
  async (request, { userId }) => {
    // Rate limit by user ID instead of IP
    const rateLimitKey = `user:${userId}`
    const rateLimitError = await applyRateLimit(request, rateLimitKey)
    if (rateLimitError) return rateLimitError
    
    // Rest of handler
    return NextResponse.json({ success: true, data: [] })
  },
  { requireAuth: true }
)
```

### Pattern 3: Admin-Only Operation

```typescript
export const DELETE = protectRoute(
  async (request, { userId, role }) => {
    // Only admins can delete
    if (role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Admins only' },
        { status: 403 }
      )
    }
    
    // Admin-specific deletion logic
    await deleteResources()
    
    logger.warn('Destructive operation', {
      operation: 'delete_all',
      userId,
      timestamp: new Date().toISOString(),
    })
    
    return NextResponse.json({ success: true })
  },
  { requireAuth: true }
)
```

### Pattern 4: Multi-Method with Different Permissions

```typescript
const handlers = protectRouteMulti(
  {
    GET: async (request, { role }) => {
      // Anyone can read
      return NextResponse.json({ success: true, data: [] })
    },
    
    POST: async (request, { role, userId }) => {
      // Only users and admins can create
      if (role === 'viewer') {
        return NextResponse.json(
          { success: false, error: 'Cannot create' },
          { status: 403 }
        )
      }
      return NextResponse.json({ success: true }, { status: 201 })
    },
    
    PUT: async (request, { role, userId }) => {
      // Only admins can update
      if (role !== 'admin') {
        return NextResponse.json(
          { success: false, error: 'Admins only' },
          { status: 403 }
        )
      }
      return NextResponse.json({ success: true })
    },
    
    DELETE: async (request, { role }) => {
      // Only admins can delete
      if (role !== 'admin') {
        return NextResponse.json(
          { success: false, error: 'Admins only' },
          { status: 403 }
        )
      }
      return NextResponse.json({ success: true })
    },
  },
  { requireAuth: true }
)

export const { GET, POST, PUT, DELETE } = handlers
```

---

## Testing Auth-Protected Routes

### Using curl

```bash
# Get a test token (replace with your actual token)
TOKEN="your.jwt.token.here"

# Test protected endpoint with auth
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/alerts

# Test protected endpoint without auth (should fail)
curl http://localhost:3000/api/alerts
# Response: 401 Unauthorized
```

### Using Jest/Vitest

```typescript
describe('Protected Endpoints', () => {
  test('GET /api/alerts with valid JWT returns 200', async () => {
    const token = generateTestToken({ userId: 'user1', role: 'user' })
    
    const response = await fetch('/api/alerts', {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    expect(response.status).toBe(200)
  })
  
  test('GET /api/alerts without JWT returns 401', async () => {
    const response = await fetch('/api/alerts')
    
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      error: expect.stringContaining('Authentication')
    })
  })
})
```

---

## Checklist for Adding a New Protected Endpoint

When creating a new protected API endpoint:

- [ ] Create route file: `app/api/endpoint/route.ts`
- [ ] Import: `import { protectRoute } from '@/lib/protected-route'`
- [ ] Wrap handler: `export const GET = protectRoute(async (req, { userId }) => {...})`
- [ ] Add to middleware: `PROTECTED_ROUTES.push('/api/endpoint')` in `middleware.ts`
- [ ] Add role config: `ROUTE_ACCESS_CONFIG['/api/endpoint'] = ['admin', 'user']`
- [ ] Write tests with and without valid JWT
- [ ] Test role-based access if applicable
- [ ] Verify error messages are consistent with other endpoints

---

## Troubleshooting

### Issue: "Cannot read property 'userId' of undefined"

**Cause**: Handler called without going through `protectRoute()`

**Fix**: Ensure route export looks like:
```typescript
export const GET = protectRoute(...) // Not: export async function GET(...)
```

### Issue: "JWT_SECRET environment variable is not set"

**Cause**: Missing JWT secret in production environment

**Fix**: Set JWT_SECRET in environment:
```bash
export JWT_SECRET="your-secret-key-here"
```

### Issue: Always getting 401 even with valid token

**Cause**: Token not in correct format or header name wrong

**Fix**: Ensure header is:
```
Authorization: Bearer <token>
```

Not:
```
Authorization: <token>
auth-token: <token>
X-Token: <token>
```

---

## Migration Guide (Old → New Pattern)

### Before

```typescript
// OLD PATTERN (DON'T USE)
import { verifyAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse('Unauthorized')
  }
  
  // Handler logic
}
```

### After

```typescript
// NEW PATTERN (USE THIS)
import { protectRoute } from '@/lib/protected-route'

export const GET = protectRoute(
  async (request, { userId }) => {
    // Handler logic - auth already verified
  },
  { requireAuth: true }
)
```

---

## Glossary

| Term | Definition |
|------|-----------|
| **JWT** | JSON Web Token - cryptographically signed auth credential |
| **Bearer Token** | JWT sent in Authorization header with "Bearer " prefix |
| **RBAC** | Role-Based Access Control - limiting access by user role |
| **Correlation ID** | Unique ID for tracing requests through logs |
| **Rate Limiting** | Preventing abuse by limiting requests per time period |
| **Middleware** | Runs before route handler, validates auth at edge |
| **protectRoute()** | Wrapper function that injects auth into single-method routes |
| **protectRouteMulti()** | Wrapper function that injects auth into multi-method routes |

---

## Related Files

- `lib/protected-route.ts` - Route protection implementation
- `lib/auth.ts` - JWT verification logic
- `middleware.ts` - Edge-level auth enforcement
- `lib/logger.ts` - Structured logging with context

---

## Support

For questions or issues:
1. Check the patterns above first
2. Review existing protected routes for examples
3. Ask in #engineering-security channel
