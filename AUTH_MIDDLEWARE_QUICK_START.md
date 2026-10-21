# Auth Middleware - Quick Start Guide

## TL;DR

### For New Routes
```typescript
import { withEnhancedAuth, getAuthFromRequest } from '@/lib/enhanced-auth-middleware'

async function handler(request: NextRequest) {
  const auth = getAuthFromRequest(request)
  // Use auth.userId, auth.role, etc.
  return NextResponse.json({ success: true })
}

export const GET = withEnhancedAuth(handler)
export const POST = withEnhancedAuth(handler, { auditLog: true })
```

### For Existing Routes
Replace inline auth checks with `extractEnhancedAuthFromHeaders`:

```typescript
// Old
const auth = await verifyAuth(request)
if (!auth.authenticated) return createUnauthorizedResponse(...)

// New
const auth = extractEnhancedAuthFromHeaders(request)
if (!auth.authenticated) return createAuthErrorResponse(...)
```

## 5-Minute Setup

### 1. Files to Deploy

```
dashboard/lib/
├── auth-config.ts                    ← NEW: Route configuration
├── enhanced-auth-middleware.ts        ← NEW: Auth utilities
├── enhanced-auth-middleware.test.ts   ← NEW: Test suite
└── [existing files remain unchanged]
```

### 2. Update Configuration

Edit `dashboard/lib/auth-config.ts` - add any custom routes:

```typescript
export const ROUTE_CONFIG: Record<string, RouteConfig> = {
  // Public
  '/api/auth/login': { requireAuth: false, public: true, rateLimit: true },
  '/api/health': { requireAuth: false, public: true, rateLimit: false },

  // Protected
  '/api/my-endpoint': { requireAuth: true, rateLimit: true },

  // Admin only
  '/api/admin': { requireAuth: true, allowedRoles: ['admin'] },
}
```

### 3. Verify Middleware

Check `dashboard/middleware.ts` uses the enhanced system:

```typescript
import { applyAuthMiddleware } from './lib/enhanced-auth-middleware'

export async function middleware(request: NextRequest) {
  // ... rate limiting ...
  
  // Apply auth
  const authResult = await applyAuthMiddleware(request)
  if (authResult instanceof NextResponse) return authResult
  
  // ... inject headers ...
}
```

### 4. Run Tests

```bash
npm test -- enhanced-auth-middleware
```

## Common Patterns

### Pattern 1: Simple Protected Route

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withEnhancedAuth, getAuthFromRequest } from '@/lib/enhanced-auth-middleware'

async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request)
  
  return NextResponse.json({
    success: true,
    userId: auth.userId,
    email: auth.email,
  })
}

export default withEnhancedAuth(GET)
```

### Pattern 2: Admin-Only Route

```typescript
import { ROUTE_CONFIG } from '@/lib/auth-config'

// Update config
ROUTE_CONFIG['/api/admin/settings'] = {
  requireAuth: true,
  allowedRoles: ['admin'],
}

async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request)
  
  // Auth middleware already checked role, so we're safe
  return NextResponse.json({ success: true })
}

export default withEnhancedAuth(POST)
```

### Pattern 3: Conditional Logic Based on Role

```typescript
async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request)
  
  if (auth.role === 'admin') {
    // Return all data
  } else {
    // Return filtered data
  }
  
  return NextResponse.json({ data: [...] })
}

export default withEnhancedAuth(GET)
```

### Pattern 4: Method-Specific Protection

```typescript
const protectedGET = withEnhancedAuth(
  async (request) => NextResponse.json({ data: [...] })
)

const publicPOST = async (request) => {
  // No auth required for POST
  return NextResponse.json({ success: true })
}

export const GET = protectedGET
export const POST = publicPOST
```

## Testing Your Implementation

### 1. Get Auth Token

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "change-me"}'

# Returns: { "token": "eyJhbGc..." }
export TOKEN="eyJhbGc..."
```

### 2. Test Protected Route

```bash
# Without token
curl http://localhost:3000/api/brain
# Returns 401

# With token
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/brain
# Returns 200 with data
```

### 3. Test Admin Route

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/settings
# Returns 403 if token user is not admin
# Returns 200 if token user is admin
```

## Checklist Before Deploy

- [ ] All new files created (`auth-config.ts`, `enhanced-auth-middleware.ts`, etc.)
- [ ] Routes configured in `auth-config.ts`
- [ ] Tests pass: `npm test -- enhanced-auth-middleware`
- [ ] No TypeScript errors: `npm run type-check`
- [ ] Linting passes: `npm run lint`
- [ ] Integration tests pass: `npm test -- api-integration`
- [ ] Manual testing completed (all patterns above)
- [ ] Code review approved
- [ ] Ready for production deployment

## Rollback Plan

If issues arise:

1. **Revert middleware.ts** to use old `verifyAuth`
2. **Keep new files** for reference (no conflicts)
3. **Investigate errors** in logs
4. **Re-deploy** after fixes

## FAQ

**Q: Do I need to update all existing routes at once?**
A: No! Routes can be updated gradually. The middleware handles both old and new patterns.

**Q: What if a route doesn't need auth?**
A: Add to `PUBLIC_ROUTES` in `auth-config.ts` with `requireAuth: false`.

**Q: How do I add role-based access control?**
A: Use `allowedRoles` in route config: `allowedRoles: ['admin', 'manager']`.

**Q: What happens if the JWT secret is missing?**
A: App throws error on startup. Set `JWT_SECRET` environment variable.

**Q: Can I test without a valid token?**
A: Public routes work fine. Protected routes return 401.

## Support

- **Logs**: Check `logs/app.log` for auth errors
- **Tests**: Run full suite with `npm test`
- **Issues**: Review `AUTH_MIDDLEWARE_IMPLEMENTATION.md` for troubleshooting
