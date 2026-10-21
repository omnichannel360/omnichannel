# Endpoint Refactoring Example

## Refactoring `/api/alerts` to Use Auth Middleware

This document shows exactly how to refactor an existing endpoint to use the new middleware-based authentication instead of manual auth checks.

---

## Current Implementation (Before)

**File:** `dashboard/app/api/alerts/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { atomicUpdate, atomicRead } from '@/lib/atomic-file-ops'
import { generateId } from '@/lib/validation'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'  // ← Manual auth imports
import { logger, createLogContext } from '@/lib/logger'
import { validateBody } from '@/lib/validation/middleware'
import { AlertCreateBodySchema, type AlertCreateBody } from '@/lib/validation/schemas'
import path from 'path'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'

interface Alert {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'critical'
  component: string
  message: string
  status: 'active' | 'resolved'
}

const ALERTS_FILE = path.join(process.cwd(), 'data', 'alerts.json')

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'alerts')
  if (rateLimitError) return rateLimitError

  // 🔴 MANUAL AUTH CHECK (To be removed)
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    logger.warn('Unauthorized alerts GET attempt', {
      method: request.method,
      path: request.nextUrl.pathname,
      error: auth.error,
    })
    return createUnauthorizedResponse(auth.error || 'Unauthorized')
  }
  // 🔴 End of manual auth section

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,  // 🔴 Gets userId from manual auth
    operation: 'load_alerts',
  })

  try {
    const alerts = await atomicRead<Alert[]>(ALERTS_FILE, [])
    logger.info('Alerts loaded successfully', {
      ...logContext,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json({ alerts })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load alerts'
    logger.error('Failed to load alerts', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const rateLimitError = await applyRateLimit(request, 'alerts')
  if (rateLimitError) return rateLimitError

  // 🔴 MANUAL AUTH CHECK (To be removed)
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Unauthorized')
  }
  // 🔴 End of manual auth section

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId: auth.userId,  // 🔴 Gets userId from manual auth
    operation: 'create_alert',
  })

  try {
    const bodyResult = await validateBody<AlertCreateBody>(request, AlertCreateBodySchema)
    if (!bodyResult.success) {
      return bodyResult.response
    }

    const { level, component, message } = bodyResult.data
    const alerts = await atomicRead<Alert[]>(ALERTS_FILE, [])

    const newAlert: Alert = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      status: 'active',
    }

    const updated = [...alerts, newAlert]
    await atomicUpdate(ALERTS_FILE, updated)

    logger.info('Alert created successfully', {
      ...logContext,
      alertId: newAlert.id,
      statusCode: 201,
      responseTimeMs: Date.now() - startTime,
    })

    return NextResponse.json(newAlert, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create alert'
    logger.error('Failed to create alert', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

---

## Refactored Implementation (After)

**File:** `dashboard/app/api/alerts/route.ts` (REFACTORED)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { atomicUpdate, atomicRead } from '@/lib/atomic-file-ops'
import { generateId } from '@/lib/validation'
// ✅ Removed: verifyAuth, createUnauthorizedResponse imports
import { logger, createLogContext } from '@/lib/logger'
import { validateBody } from '@/lib/validation/middleware'
import { AlertCreateBodySchema, type AlertCreateBody } from '@/lib/validation/schemas'
import path from 'path'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'

interface Alert {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'critical'
  component: string
  message: string
  status: 'active' | 'resolved'
}

const ALERTS_FILE = path.join(process.cwd(), 'data', 'alerts.json')

// ✅ Helper: Extract auth context from middleware-injected headers
function getAuthContext(request: NextRequest) {
  return {
    userId: request.headers.get('x-user-id') || '',
    userEmail: request.headers.get('x-user-email') || '',
    userRole: request.headers.get('x-user-role') || '',
  }
}

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitError = await applyRateLimit(request, 'alerts')
  if (rateLimitError) return rateLimitError

  // ✅ REFACTORED: Auth guaranteed by middleware
  // No need to check auth status - if we're here, token is valid
  const { userId } = getAuthContext(request)

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId,  // ✅ Gets userId from middleware headers
    operation: 'load_alerts',
  })

  try {
    const alerts = await atomicRead<Alert[]>(ALERTS_FILE, [])
    logger.info('Alerts loaded successfully', {
      ...logContext,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json({ alerts })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load alerts'
    logger.error('Failed to load alerts', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const rateLimitError = await applyRateLimit(request, 'alerts')
  if (rateLimitError) return rateLimitError

  // ✅ REFACTORED: Auth guaranteed by middleware
  const { userId } = getAuthContext(request)

  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    userId,  // ✅ Gets userId from middleware headers
    operation: 'create_alert',
  })

  try {
    const bodyResult = await validateBody<AlertCreateBody>(request, AlertCreateBodySchema)
    if (!bodyResult.success) {
      return bodyResult.response
    }

    const { level, component, message } = bodyResult.data
    const alerts = await atomicRead<Alert[]>(ALERTS_FILE, [])

    const newAlert: Alert = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      status: 'active',
    }

    const updated = [...alerts, newAlert]
    await atomicUpdate(ALERTS_FILE, updated)

    logger.info('Alert created successfully', {
      ...logContext,
      alertId: newAlert.id,
      statusCode: 201,
      responseTimeMs: Date.now() - startTime,
    })

    return NextResponse.json(newAlert, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create alert'
    logger.error('Failed to create alert', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

---

## Changes Summary

### Removed

| Code | Reason |
|------|--------|
| `import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'` | No longer needed - middleware handles verification |
| `const auth = await verifyAuth(request)` | Middleware already verified auth |
| `if (!auth.authenticated) { return createUnauthorizedResponse(...) }` | Middleware returns 401 before handler runs |
| `auth.userId` references | Use `getAuthContext()` helper instead |

### Added

| Code | Reason |
|------|--------|
| `getAuthContext()` helper function | Cleaner way to extract auth from headers |
| `userId` from `x-user-id` header | Provided by middleware |
| Comments marking refactored sections | Document what changed |

### Line Count Reduction

```
Before: ~145 lines (including auth checks in both GET and POST)
After:  ~125 lines (removed duplicate auth checks)
Reduction: ~14% fewer lines of boilerplate code
```

---

## Testing the Refactored Endpoint

### Test 1: Without Authentication (Should Fail)

```bash
curl -X GET http://localhost:3000/api/alerts

# Response (401):
# {
#   "success": false,
#   "error": "Missing or malformed Authorization header"
# }
```

### Test 2: With Valid Token (Should Work)

```bash
# Generate token
TOKEN=$(curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "email": "user@example.com",
    "role": "user"
  }' | jq -r '.accessToken')

# Use token
curl -X GET http://localhost:3000/api/alerts \
  -H "Authorization: Bearer $TOKEN"

# Response (200):
# {
#   "alerts": [...]
# }
```

### Test 3: Create New Alert with Valid Token

```bash
TOKEN=$(curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "email": "user@example.com",
    "role": "user"
  }' | jq -r '.accessToken')

curl -X POST http://localhost:3000/api/alerts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "level": "warning",
    "component": "database",
    "message": "High query latency detected"
  }'

# Response (201):
# {
#   "id": "alert-abc123",
#   "timestamp": "2026-10-22T12:34:56.000Z",
#   "level": "warning",
#   "component": "database",
#   "message": "High query latency detected",
#   "status": "active"
# }
```

---

## Updated Test Cases

### Before: Manual Auth Test

```typescript
describe('GET /api/alerts', () => {
  test('should return 401 without authentication', async () => {
    const response = await fetch('/api/alerts')
    expect(response.status).toBe(401)  // Endpoint returned 401
  })
})
```

### After: Middleware Auth Test

```typescript
describe('GET /api/alerts', () => {
  test('should return 401 without authentication', async () => {
    const response = await fetch('/api/alerts')
    expect(response.status).toBe(401)  // Middleware returned 401 (same result)
  })

  test('should return 200 with valid token', async () => {
    const token = await generateToken('user-1', 'test@example.com', 'user', 3600)
    const response = await fetch('/api/alerts', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.alerts).toBeDefined()
  })
})
```

---

## Implementation Checklist for This Endpoint

- [ ] Read and understand current implementation
- [ ] Add `getAuthContext()` helper function
- [ ] Remove `verifyAuth` and `createUnauthorizedResponse` imports
- [ ] Remove auth check code block from `GET` handler
- [ ] Update userId to use `getAuthContext()`
- [ ] Remove auth check code block from `POST` handler
- [ ] Verify imports are correct
- [ ] Run TypeScript compiler: `tsc --noEmit`
- [ ] Run tests: `npm test -- alerts`
- [ ] Test with cURL (with and without token)
- [ ] Test POST request to create alert
- [ ] Verify logging still works correctly
- [ ] Review code for clarity
- [ ] Commit changes

---

## Pattern for Other Endpoints

All other endpoints can be refactored following the same pattern:

1. **Add helper function** at top of file:
```typescript
function getAuthContext(request: NextRequest) {
  return {
    userId: request.headers.get('x-user-id') || '',
    userEmail: request.headers.get('x-user-email') || '',
    userRole: request.headers.get('x-user-role') || '',
  }
}
```

2. **Remove imports:**
```typescript
// Remove these:
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
```

3. **Remove auth blocks** from all handlers:
```typescript
// Remove this:
const auth = await verifyAuth(request)
if (!auth.authenticated) {
  return createUnauthorizedResponse(auth.error)
}
```

4. **Update user context** references:
```typescript
// Change from:
const userId = auth.payload?.sub

// To:
const { userId } = getAuthContext(request)
```

5. **Test** the endpoint with and without auth tokens

---

## Files to Update

Apply this same refactoring pattern to:

- [ ] `/api/alerts` (example - shown above)
- [ ] `/api/brain`
- [ ] `/api/conductor`
- [ ] `/api/kanban`
- [ ] `/api/meetings`
- [ ] `/api/metrics`
- [ ] `/api/profiles`

Each can be done in ~5 minutes following the pattern above.

---

## Verification

After refactoring each endpoint:

```bash
# 1. TypeScript check
npm run typecheck

# 2. Run specific endpoint tests
npm test -- alerts

# 3. Manual test with token
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/alerts

# 4. Manual test without token
curl http://localhost:3000/api/alerts
```

All tests should pass, and both token and no-token cases should behave correctly.

---

**Example Date:** 2026-10-22
**Refactoring Time:** ~5-10 minutes per endpoint
**Pattern:** Follows consistently across all endpoints
