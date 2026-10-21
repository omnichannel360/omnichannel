# Rate Limiting - Apply to All Endpoints

## Quick Copy-Paste Template

### Template 1: Simple Public Endpoint (Auth)

```typescript
// dashboard/app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, createRateLimitError, addRateLimitHeaders } from '@/lib/rate-limit-middleware'
import { generateToken, generateRefreshToken } from '@/lib/auth'

/**
 * POST /api/auth
 * Generate authentication tokens
 * 
 * Rate Limit: 5 requests per 15 minutes (IP-based)
 */
export async function POST(request: NextRequest) {
  // 1. CHECK RATE LIMIT (add these 5 lines)
  const rateLimitResult = await checkRateLimit(request, {
    endpoint: '/api/auth'
  })
  
  if (!rateLimitResult.allowed) {
    return createRateLimitError(rateLimitResult)
  }
  
  // 2. EXISTING CODE UNCHANGED
  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  try {
    const { userId, email, role = 'user' } = body as Record<string, unknown>

    if (!userId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, email' },
        { status: 400 }
      )
    }

    const accessToken = await generateToken(userId as string, email as string, role as string, 24 * 60 * 60)
    const refreshToken = await generateRefreshToken(userId as string, email as string, 7 * 24 * 60 * 60)

    // 3. WRAP RESPONSE IN addRateLimitHeaders (change this line)
    const response = NextResponse.json({
      accessToken,
      refreshToken,
      expiresIn: 24 * 60 * 60,
      tokenType: 'Bearer',
    })
    
    return addRateLimitHeaders(response, rateLimitResult) // ADD THIS LINE
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate tokens'
    const response = NextResponse.json(
      { error: message },
      { status: 500 }
    )
    return addRateLimitHeaders(response, rateLimitResult) // ADD THIS LINE
  }
}
```

### Template 2: Authenticated Endpoint (with User Tracking)

```typescript
// dashboard/app/api/metrics/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, createRateLimitError, addRateLimitHeaders } from '@/lib/rate-limit-middleware'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'

/**
 * GET /api/metrics
 * Fetch user metrics
 * 
 * Rate Limit: 30 requests per 1 minute (user-based)
 */
export async function GET(request: NextRequest) {
  // 1. AUTHENTICATE FIRST (existing code)
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  // 2. CHECK RATE LIMIT (add userId for authenticated endpoints)
  const rateLimitResult = await checkRateLimit(request, {
    endpoint: '/api/metrics',
    userId: auth.userId  // ← KEY DIFFERENCE: Add userId for authenticated endpoints
  })
  
  if (!rateLimitResult.allowed) {
    return createRateLimitError(rateLimitResult)
  }

  try {
    // 3. YOUR EXISTING CODE
    const data = {
      // ... your metrics logic
    }
    
    // 4. WRAP RESPONSE
    const response = NextResponse.json(data)
    return addRateLimitHeaders(response, rateLimitResult)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch metrics'
    const response = NextResponse.json(
      { error: message },
      { status: 500 }
    )
    return addRateLimitHeaders(response, rateLimitResult)
  }
}
```

### Template 3: Complex Endpoint (File Operations)

```typescript
// dashboard/app/api/meetings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, createRateLimitError, addRateLimitHeaders } from '@/lib/rate-limit-middleware'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { atomicRead, atomicWrite } from '@/lib/atomic-file-ops'

/**
 * GET /api/meetings
 * Fetch meeting configurations
 * 
 * Rate Limit: 10 requests per 1 minute (user-based)
 * Note: Strict limit because file I/O is expensive
 */
export async function GET(request: NextRequest) {
  // 1. AUTHENTICATE
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  // 2. CHECK RATE LIMIT (use userId for tracked users)
  const rateLimitResult = await checkRateLimit(request, {
    endpoint: '/api/meetings',
    userId: auth.userId
  })
  
  if (!rateLimitResult.allowed) {
    return createRateLimitError(rateLimitResult)
  }

  try {
    // 3. YOUR EXISTING CODE
    const config = await atomicRead(MEETINGS_DATA_PATH)
    
    // 4. WRAP RESPONSE
    const response = NextResponse.json(config)
    return addRateLimitHeaders(response, rateLimitResult)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch meetings'
    const response = NextResponse.json(
      { error: message },
      { status: 500 }
    )
    return addRateLimitHeaders(response, rateLimitResult)
  }
}

export async function POST(request: NextRequest) {
  // 1. AUTHENTICATE
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  // 2. CHECK RATE LIMIT
  const rateLimitResult = await checkRateLimit(request, {
    endpoint: '/api/meetings',
    userId: auth.userId
  })
  
  if (!rateLimitResult.allowed) {
    return createRateLimitError(rateLimitResult)
  }

  try {
    // 3. YOUR EXISTING CODE
    const body = await request.json()
    // ... validation and processing
    
    // 4. WRAP RESPONSE
    const response = NextResponse.json({ success: true })
    return addRateLimitHeaders(response, rateLimitResult)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create meeting'
    const response = NextResponse.json(
      { error: message },
      { status: 500 }
    )
    return addRateLimitHeaders(response, rateLimitResult)
  }
}
```

---

## Endpoint Mapping

Apply the appropriate template to each endpoint:

### PUBLIC ENDPOINTS (IP-based, Template 1)
```
✓ /api/auth              → Template 1
✓ /api/auth/login        → Template 1
✓ /api/auth/verify       → Template 1
✓ /api/health            → Template 1
```

### AUTHENTICATED ENDPOINTS (User-based, Template 2)
```
✓ /api/metrics           → Template 2
✓ /api/alerts            → Template 2
✓ /api/profiles          → Template 2
```

### COMPLEX OPERATIONS (User-based, Template 3)
```
✓ /api/meetings          → Template 3 (GET + POST)
✓ /api/kanban            → Template 3
✓ /api/conductor         → Template 3
✓ /api/brain             → Template 3
```

---

## Implementation Checklist

For each endpoint:

- [ ] Add import: `import { checkRateLimit, createRateLimitError, addRateLimitHeaders } from '@/lib/rate-limit-middleware'`
- [ ] Add rate limit check at beginning of handler
- [ ] Return error if rate limit exceeded: `if (!rateLimitResult.allowed) return createRateLimitError(rateLimitResult)`
- [ ] Wrap all response returns with `addRateLimitHeaders(response, rateLimitResult)`
- [ ] Include `userId` parameter for authenticated endpoints
- [ ] Test with `npm test`
- [ ] Manual test: trigger rate limit by making rapid requests

---

## Quick Edit Pattern

For each route file, make these changes:

```diff
  import { NextRequest, NextResponse } from 'next/server'
  import { someExisting } from '@/lib/existing'
+ import { checkRateLimit, createRateLimitError, addRateLimitHeaders } from '@/lib/rate-limit-middleware'

  export async function GET(request: NextRequest) {
+   const rateLimitResult = await checkRateLimit(request, {
+     endpoint: '/api/your-endpoint',
+     userId: auth?.userId  // Only for authenticated endpoints
+   })
+   
+   if (!rateLimitResult.allowed) {
+     return createRateLimitError(rateLimitResult)
+   }
+
    try {
      // Your existing code...
      const response = NextResponse.json(data)
+     return addRateLimitHeaders(response, rateLimitResult)
    } catch (error) {
      // ...
      const response = NextResponse.json({ error: '...' }, { status: 500 })
+     return addRateLimitHeaders(response, rateLimitResult)
    }
  }
```

---

## Testing Each Endpoint

### Test Script Template

```bash
#!/bin/bash
# test-rate-limit.sh

ENDPOINT=$1
LIMIT=$2
DELAY=${3:-1}

echo "Testing $ENDPOINT with limit $LIMIT"
echo "========================================"

for i in $(seq 1 $((LIMIT + 3))); do
  echo "Request $i:"
  curl -s -w "Status: %{http_code}\n" \
    -H "x-forwarded-for: 127.0.0.1" \
    -H "Content-Type: application/json" \
    "http://localhost:3000$ENDPOINT"
  
  sleep $DELAY
done

echo ""
echo "Expected: First $LIMIT requests return 200, rest return 429"
```

### Test Examples

```bash
# Auth endpoint - expect 5 allowed, then 429
./test-rate-limit.sh "/api/auth" 5

# Health endpoint - expect 120 allowed, then 429
./test-rate-limit.sh "/api/health" 120 0.01

# Metrics endpoint - expect 30 allowed, then 429 (need auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-forwarded-for: 127.0.0.1" \
  "http://localhost:3000/api/metrics"
```

---

## Verification Checklist

After implementing on each endpoint:

- [ ] Endpoint still works (200 response)
- [ ] Rate limit headers present: `X-RateLimit-*`
- [ ] Exceeding limit returns 429
- [ ] 429 response includes `Retry-After` header
- [ ] Different IPs have separate limits (public endpoints)
- [ ] Different users have separate limits (authenticated endpoints)
- [ ] Tests pass: `npm test -- __tests__/rate-limiting.test.ts`

---

## Common Mistakes to Avoid

❌ **WRONG:** Only add rate limit on some methods
```typescript
export async function GET(request) {
  // Has rate limiting
}
export async function POST(request) {
  // Missing rate limiting!
}
```

✅ **RIGHT:** Add to all methods
```typescript
export async function GET(request) {
  const rateLimitResult = await checkRateLimit(...)
  // ...
}
export async function POST(request) {
  const rateLimitResult = await checkRateLimit(...)
  // ...
}
```

---

❌ **WRONG:** Forget to return error
```typescript
const rateLimitResult = await checkRateLimit(...)
// Missing: if (!rateLimitResult.allowed) return ...
```

✅ **RIGHT:** Return immediately
```typescript
const rateLimitResult = await checkRateLimit(...)
if (!rateLimitResult.allowed) {
  return createRateLimitError(rateLimitResult)
}
```

---

❌ **WRONG:** Forget to add headers
```typescript
return NextResponse.json(data)
// Missing headers!
```

✅ **RIGHT:** Add headers to response
```typescript
const response = NextResponse.json(data)
return addRateLimitHeaders(response, rateLimitResult)
```

---

## Deploy Order (Recommended)

1. **Critical First** (Brute force protection)
   - `/api/auth`
   - `/api/auth/login`
   - `/api/auth/verify`

2. **Data Next** (Standard protection)
   - `/api/metrics`
   - `/api/profiles`
   - `/api/alerts`

3. **Complex Last** (Complete coverage)
   - `/api/meetings`
   - `/api/kanban`
   - `/api/conductor`
   - `/api/brain`
   - `/api/health` (optional, already public)

This allows testing the auth protection first, then data endpoints, then complex ones.

---

## After Implementation

1. Monitor logs for rate limit hits
2. Adjust limits if needed based on real traffic
3. Document in runbook for on-call
4. Set up alerts for unusual rate limit activity

See `RATE_LIMITING_IMPLEMENTATION.md` for detailed guide.
