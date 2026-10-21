# API Route Migration Examples

This document shows before/after examples of migrating routes to use the enhanced auth middleware.

## Example 1: Simple GET Route - `/api/profiles`

### Before (Current Implementation)
```typescript
// dashboard/app/api/profiles/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { validateQuery } from '@/lib/validation/middleware'

export async function GET(request: NextRequest) {
  // Rate limit
  const rateLimitError = await applyRateLimit(request, 'profiles')
  if (rateLimitError) return rateLimitError

  // Auth check (inline)
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error)
  }

  // Actual logic
  try {
    const entries = await fs.readdir(PROFILES_DIR)
    return NextResponse.json({
      success: true,
      data: entries,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
```

### After (Enhanced Middleware)
```typescript
// dashboard/app/api/profiles/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import { withEnhancedAuth, getAuthFromRequest } from '@/lib/enhanced-auth-middleware'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { validateQuery } from '@/lib/validation/middleware'

async function handler(request: NextRequest) {
  // Auth check is handled by withEnhancedAuth wrapper
  const auth = getAuthFromRequest(request)
  
  // Rate limit (now handled by middleware.ts)
  const rateLimitError = await applyRateLimit(request, 'profiles')
  if (rateLimitError) return rateLimitError

  // Actual logic (same as before)
  try {
    const entries = await fs.readdir(PROFILES_DIR)
    return NextResponse.json({
      success: true,
      data: entries,
      userId: auth.userId, // Now have user context
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// Wrap with enhanced auth
export const GET = withEnhancedAuth(handler)
```

### Key Changes
- ❌ Remove: inline `verifyAuth` and `createUnauthorizedResponse`
- ✅ Add: `withEnhancedAuth` wrapper
- ✅ Use: `getAuthFromRequest` to access user context
- ✅ Keep: Rate limiting (still needed for individual routes)

---

## Example 2: POST Route with Validation - `/api/brain`

### Before (Current Implementation)
```typescript
// dashboard/app/api/brain/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { validateQuery } from '@/lib/validation/middleware'

export async function GET(request: NextRequest) {
  // Rate limit
  const rateLimitError = await applyRateLimit(request, 'brain')
  if (rateLimitError) return rateLimitError

  // Auth check
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error)
  }

  // Validate query
  const queryResult = await validateQuery(request, BrainQuerySchema)
  if (!queryResult.success) {
    return queryResult.response
  }

  const { category, limit } = queryResult.data

  try {
    // Business logic...
    return NextResponse.json({
      success: true,
      data: {
        memories,
        categories,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
```

### After (Enhanced Middleware)
```typescript
// dashboard/app/api/brain/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withEnhancedAuth, getAuthFromRequest } from '@/lib/enhanced-auth-middleware'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { validateQuery } from '@/lib/validation/middleware'
import { logger, createLogContext } from '@/lib/logger'

async function handler(request: NextRequest) {
  // Auth is guaranteed by wrapper
  const auth = getAuthFromRequest(request)
  
  // Log with user context
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,
    operation: 'brain_query',
  })

  // Rate limit (still needed)
  const rateLimitError = await applyRateLimit(request, 'brain')
  if (rateLimitError) {
    logger.warn('Rate limit exceeded', logContext)
    return rateLimitError
  }

  // Validate query
  const queryResult = await validateQuery(request, BrainQuerySchema)
  if (!queryResult.success) {
    logger.warn('Invalid query parameters', { ...logContext, errors: queryResult.errors })
    return queryResult.response
  }

  const { category, limit } = queryResult.data

  try {
    // Business logic... (same as before)
    logger.info('Brain query completed', {
      ...logContext,
      category,
      memoryCount: memories.length,
    })
    
    return NextResponse.json({
      success: true,
      data: {
        memories,
        categories,
      },
    })
  } catch (error) {
    logger.error('Brain query failed', error, logContext)
    return NextResponse.json(
      { success: false, error: 'Failed to query brain' },
      { status: 500 }
    )
  }
}

// Apply enhanced auth wrapper
export const GET = withEnhancedAuth(handler)
```

### Key Changes
- ❌ Remove: `verifyAuth`, `createUnauthorizedResponse`
- ✅ Add: `withEnhancedAuth` wrapper
- ✅ Use: `getAuthFromRequest` for user context
- ✅ Enhance: Better logging with user context
- ✅ Keep: Validation and rate limiting logic

---

## Example 3: Admin-Only Route - `/api/admin/settings`

### Before (No Auth Implementation)
```typescript
// dashboard/app/api/admin/settings/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // No auth check! (security issue)
  const settings = await loadSettings()
  return NextResponse.json({ settings })
}

export async function POST(request: NextRequest) {
  // No auth check! (security issue)
  const settings = await request.json()
  await saveSettings(settings)
  return NextResponse.json({ success: true })
}
```

### After (Enhanced Middleware with Role Check)

**Step 1: Update Route Config**
```typescript
// dashboard/lib/auth-config.ts
export const ROUTE_CONFIG: Record<string, RouteConfig> = {
  // ... existing routes ...
  
  // Add admin routes
  '/api/admin/settings': {
    requireAuth: true,
    allowedRoles: ['admin'],  // Only admins can access
    rateLimit: true,
  },
}
```

**Step 2: Implement Route Handler**
```typescript
// dashboard/app/api/admin/settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withEnhancedAuth, getAuthFromRequest } from '@/lib/enhanced-auth-middleware'
import { logger, createLogContext } from '@/lib/logger'

async function getHandler(request: NextRequest) {
  const auth = getAuthFromRequest(request)
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,
    userRole: auth.role,
    operation: 'admin_get_settings',
  })

  try {
    // Auth middleware already verified role === 'admin'
    const settings = await loadSettings()
    
    logger.info('Admin settings retrieved', {
      ...logContext,
      settingsCount: Object.keys(settings).length,
    })
    
    return NextResponse.json({ success: true, settings })
  } catch (error) {
    logger.error('Failed to get admin settings', error, logContext)
    return NextResponse.json(
      { success: false, error: 'Failed to load settings' },
      { status: 500 }
    )
  }
}

async function postHandler(request: NextRequest) {
  const auth = getAuthFromRequest(request)
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,
    userRole: auth.role,
    operation: 'admin_update_settings',
  })

  try {
    // Auth middleware already verified role === 'admin'
    const newSettings = await request.json()
    await saveSettings(newSettings)
    
    logger.info('Admin settings updated', {
      ...logContext,
      updatedFields: Object.keys(newSettings),
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Failed to update admin settings', error, logContext)
    return NextResponse.json(
      { success: false, error: 'Failed to save settings' },
      { status: 500 }
    )
  }
}

// Only admins can access these endpoints
export const GET = withEnhancedAuth(getHandler)
export const POST = withEnhancedAuth(postHandler)
```

### Key Changes
- ✅ Add: Route config with `allowedRoles: ['admin']`
- ✅ Add: `withEnhancedAuth` wrapper to both GET and POST
- ✅ Add: Comprehensive logging with user context
- ✅ Security: Role check done by middleware, handlers are safe

---

## Example 4: Public Route - `/api/health`

### Before (No Auth Implementation)
```typescript
// dashboard/app/api/health/route.ts
export async function GET(request: NextRequest) {
  // Public endpoint, no auth needed
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  })
}
```

### After (Explicitly Public, No Changes Needed)
```typescript
// dashboard/app/api/health/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Config marks this as public, middleware allows it through
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  })
}
```

**Route Config**:
```typescript
// dashboard/lib/auth-config.ts
'/api/health': {
  requireAuth: false,  // Public
  public: true,
  rateLimit: false,    // Don't rate limit health checks
}
```

### Key Points
- ✅ No need to use `withEnhancedAuth` for public routes
- ✅ Middleware configuration explicitly marks route as public
- ✅ Health checks not rate limited (better for monitoring)

---

## Migration Checklist Per Route

For each route you migrate, follow this checklist:

- [ ] **Add route to `auth-config.ts`** (if not already there)
  - [ ] Set `requireAuth: true/false`
  - [ ] Set `allowedRoles` if role-based
  - [ ] Set `rateLimit: true/false`

- [ ] **Update route handler**
  - [ ] Remove `verifyAuth` call
  - [ ] Remove `createUnauthorizedResponse` import
  - [ ] Add `withEnhancedAuth` wrapper
  - [ ] Replace `getAuthFromRequest` to access auth context
  - [ ] Keep validation and rate limiting if present

- [ ] **Add logging** (optional but recommended)
  - [ ] Import `logger` and `createLogContext`
  - [ ] Log operations with user context

- [ ] **Test the endpoint**
  - [ ] Without auth: should return 401
  - [ ] With valid auth: should return 200
  - [ ] With wrong role (if applicable): should return 403

- [ ] **Update tests**
  - [ ] Test public vs protected
  - [ ] Test with/without valid token
  - [ ] Test role-based access

---

## Summary of Changes

| Aspect | Before | After |
|--------|--------|-------|
| Auth Check | Inline in handler | Middleware + `withEnhancedAuth` |
| Error Handling | `createUnauthorizedResponse` | Auto-handled by wrapper |
| Logging | Manual | Built-in with user context |
| Rate Limiting | In handler | Middleware handles most cases |
| Role Check | Manual if present | Automatic in middleware |
| Type Safety | Partial | Full with `EnhancedAuthContext` |
| Code Repetition | High | Low (wrapper pattern) |
| Security | Varies | Consistent across all routes |

---

## Next: Full Migration Script

To migrate all routes at once, run:
```bash
# (Future automation script)
npm run migrate:auth-middleware
```

This will:
1. Update all routes to use `withEnhancedAuth`
2. Remove old `verifyAuth` calls
3. Update `auth-config.ts` with all routes
4. Run tests to verify migration
5. Generate migration report
