# Rate Limiting - Endpoint Migration Guide

Apply these changes to each API endpoint to add rate limiting.

---

## Template Pattern

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit, createHealthCheckSkip } from '@/lib/rate-limit-middleware'
import { RateLimitPresets } from '@/lib/rate-limiter'

// Wrap your handler with rate limiting
export const METHOD = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    // Your existing handler code
    return NextResponse.json({ /* response */ })
  },
  {
    config: RateLimitPresets.TIER, // Choose tier
    skip: OPTIONAL_SKIP_FUNCTION, // Optional bypass
  }
)
```

---

## P0 - Critical (Week 1)

### 1. POST `/api/auth/login`

**File:** `dashboard/app/api/auth/login/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit-middleware'
import { RateLimitPresets } from '@/lib/rate-limiter'
import { verifyAuth } from '@/lib/auth'

export const POST = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    try {
      const credentials = await request.json()
      
      // Your existing login logic
      // ... validate credentials ...
      
      return NextResponse.json({
        success: true,
        token: '...',
      })
    } catch (error) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      )
    }
  },
  {
    config: RateLimitPresets.auth, // 5 requests per minute per IP
  }
)
```

### 2. POST `/api/auth/verify`

**File:** `dashboard/app/api/auth/verify/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit-middleware'
import { RateLimitPresets } from '@/lib/rate-limiter'

export const POST = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    try {
      const token = await request.json()
      
      // Your existing verify logic
      // ... verify token ...
      
      return NextResponse.json({ valid: true })
    } catch {
      return NextResponse.json(
        { valid: false },
        { status: 401 }
      )
    }
  },
  {
    config: RateLimitPresets.auth, // 5 requests per minute per IP
  }
)
```

---

## P1 - High (Week 2)

### 3. GET `/api/health`

**File:** `dashboard/app/api/health/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit, createHealthCheckSkip } from '@/lib/rate-limit-middleware'
import { RateLimitPresets } from '@/lib/rate-limiter'

export const GET = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    // Your existing health check logic
    // ... gather component status ...
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {
        // ... component status ...
      },
    })
  },
  {
    config: RateLimitPresets.health, // No limit for health checks
    skip: createHealthCheckSkip(), // Bypass rate limiting
  }
)
```

### 4. GET `/api/auth`

**File:** `dashboard/app/api/auth/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit-middleware'
import { RateLimitPresets } from '@/lib/rate-limiter'
import { verifyAuth } from '@/lib/auth'

export const GET = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Your existing GET logic
    return NextResponse.json({
      authenticated: true,
      user: auth.user,
    })
  },
  {
    config: RateLimitPresets.api, // 100 req/15min per user
  }
)
```

### 5. GET/POST/PUT/DELETE `/api/meetings`

**File:** `dashboard/app/api/meetings/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit-middleware'
import { RateLimitPresets } from '@/lib/rate-limiter'
import { verifyAuth } from '@/lib/auth'

export const GET = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Your existing GET logic
    return NextResponse.json({ meetings: [] })
  },
  { config: RateLimitPresets.api }
)

export const POST = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const data = await request.json()
    // Your existing POST logic
    return NextResponse.json({ success: true, id: '...' })
  },
  { config: RateLimitPresets.api }
)

export const PUT = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const data = await request.json()
    // Your existing PUT logic
    return NextResponse.json({ success: true })
  },
  { config: RateLimitPresets.api }
)

export const DELETE = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Your existing DELETE logic
    return NextResponse.json({ success: true })
  },
  { config: RateLimitPresets.api }
)
```

---

## P2 - Medium (Week 3-4)

### 6. GET `/api/metrics`

**File:** `dashboard/app/api/metrics/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit-middleware'
import { RateLimitPresets } from '@/lib/rate-limiter'

export const GET = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    // Your existing metrics logic
    return NextResponse.json({
      metrics: {
        // ... metrics data ...
      },
    })
  },
  {
    config: RateLimitPresets.public, // 1000 req/hour
  }
)
```

### 7. GET/POST `/api/alerts`

**File:** `dashboard/app/api/alerts/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit-middleware'
import { RateLimitPresets } from '@/lib/rate-limiter'
import { verifyAuth } from '@/lib/auth'

export const GET = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Your existing GET logic
    return NextResponse.json({ alerts: [] })
  },
  { config: RateLimitPresets.api }
)

export const POST = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const data = await request.json()
    // Your existing POST logic
    return NextResponse.json({ success: true, id: '...' })
  },
  { config: RateLimitPresets.api }
)
```

### 8. POST `/api/brain`

**File:** `dashboard/app/api/brain/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit-middleware'
import { RateLimitPresets } from '@/lib/rate-limiter'
import { verifyAuth } from '@/lib/auth'

export const POST = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const data = await request.json()
    // Your existing POST logic
    return NextResponse.json({ result: '...' })
  },
  { config: RateLimitPresets.api }
)
```

### 9. GET/POST `/api/conductor`

**File:** `dashboard/app/api/conductor/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit-middleware'
import { RateLimitPresets } from '@/lib/rate-limiter'
import { verifyAuth } from '@/lib/auth'

export const GET = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Your existing GET logic
    return NextResponse.json({ status: '...' })
  },
  { config: RateLimitPresets.api }
)

export const POST = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const data = await request.json()
    // Your existing POST logic
    return NextResponse.json({ success: true })
  },
  { config: RateLimitPresets.api }
)
```

### 10. GET/POST `/api/kanban`

**File:** `dashboard/app/api/kanban/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit-middleware'
import { RateLimitPresets } from '@/lib/rate-limiter'
import { verifyAuth } from '@/lib/auth'

export const GET = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Your existing GET logic
    return NextResponse.json({ kanban: {} })
  },
  { config: RateLimitPresets.api }
)

export const POST = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const data = await request.json()
    // Your existing POST logic
    return NextResponse.json({ success: true })
  },
  { config: RateLimitPresets.api }
)
```

### 11. GET/POST `/api/profiles`

**File:** `dashboard/app/api/profiles/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit-middleware'
import { RateLimitPresets } from '@/lib/rate-limiter'
import { verifyAuth } from '@/lib/auth'

export const GET = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Your existing GET logic
    return NextResponse.json({ profiles: [] })
  },
  { config: RateLimitPresets.api }
)

export const POST = withRateLimit(
  async (request: NextRequest): Promise<NextResponse> => {
    const auth = await verifyAuth(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const data = await request.json()
    // Your existing POST logic
    return NextResponse.json({ success: true, id: '...' })
  },
  { config: RateLimitPresets.api }
)
```

---

## Shutdown Handler

Add to your server shutdown logic:

**File:** `dashboard/app.ts` or your main entry point

```typescript
import { cleanupRateLimiters } from '@/lib/rate-limit-middleware'

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, cleaning up...')
  
  try {
    // Cleanup rate limiters
    await cleanupRateLimiters()
    console.log('Rate limiters cleaned up')
  } catch (error) {
    console.error('Cleanup error:', error)
  }
  
  // Close other resources if needed
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, cleaning up...')
  
  try {
    await cleanupRateLimiters()
    console.log('Rate limiters cleaned up')
  } catch (error) {
    console.error('Cleanup error:', error)
  }
  
  process.exit(0)
})
```

---

## Verification Checklist

After applying changes to each endpoint:

- [ ] Import statements added
- [ ] Handler wrapped with `withRateLimit()`
- [ ] Correct `RateLimitPresets.TIER` chosen
- [ ] Test endpoint manually
- [ ] Check rate limit headers in response
- [ ] Test rate limiting by exceeding limit
- [ ] Verify HTTP 429 response
- [ ] Check X-Rate-Limit-* headers

---

## Testing Each Endpoint

### Test with curl

```bash
# Test auth endpoint (should get rate limited after 5 requests)
for i in {1..7}; do
  echo "Request $i:"
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}' \
    -w "\nRate-Limit-Remaining: %{http_header \"RateLimit-Remaining\"}\n\n"
  sleep 0.5
done

# Expected: First 5 return 200/401, 6th and 7th return 429
```

### Test health check bypass

```bash
# Should work unlimited times
for i in {1..100}; do
  curl http://localhost:3000/api/health | jq .status
done
```

---

## Rollback Instructions

If issues occur with a specific endpoint:

1. Remove the `withRateLimit()` wrapper
2. Restore original handler export
3. Test endpoint still works
4. Check logs for errors
5. Re-apply with fixed configuration

**Example (rollback auth/login):**

```typescript
// BEFORE (with rate limiting)
export const POST = withRateLimit(
  async (request: NextRequest) => { /* ... */ },
  { config: RateLimitPresets.auth }
)

// AFTER (without rate limiting - rollback)
export const POST = async (request: NextRequest) => {
  // Your handler logic
  return NextResponse.json({ /* ... */ })
}
```

---

## Complete Implementation Order

1. **Deploy core files** (rate-limiter.ts, middleware.ts)
2. **Run tests** → Verify all pass
3. **Week 1:** Auth endpoints (POST /api/auth/login, POST /api/auth/verify)
4. **Week 2:** Health, meetings, auth GET
5. **Week 3:** Metrics, alerts, brain
6. **Week 4:** Conductor, kanban, profiles
7. **Week 5:** Full monitoring and observability

---

**Status:** Ready for migration  
**Total endpoints:** 11 major endpoints  
**Estimated effort:** 2-3 hours for complete implementation  
**Testing time:** 1-2 hours
