# Rate Limiting Implementation - Complete Guide

## Executive Summary

Comprehensive rate limiting implementation across all 11 API endpoints with:
- **Sliding window algorithm** (tracks request counts per time window)
- **IP-based identification** (with fallback to user IDs for authenticated endpoints)
- **Per-endpoint configuration** (different limits for different endpoints)
- **Standard HTTP headers** (X-RateLimit-*, Retry-After)
- **In-memory storage** (singleton pattern with automatic cleanup)

## Architecture Overview

### Components

1. **Store** (`lib/rateLimit/store.ts`)
   - Sliding window rate limit storage
   - Automatic cleanup every 60 seconds
   - Per-endpoint tracking with nested maps
   - Thread-safe singleton instance

2. **Middleware** (`lib/rateLimit/middleware.ts`)
   - Express/Next.js middleware factory
   - Rate limit header generation
   - Predefined endpoint configurations
   - Custom key generators (IP, user, endpoint)

3. **Rate Limiter** (`lib/rate-limiter.ts`)
   - Token bucket implementation (alternative)
   - Token refill logic
   - Request accounting

## Implementation Steps

### Step 1: Core Infrastructure (COMPLETED)

✅ Created `/lib/rateLimit/store.ts` - Sliding window storage
✅ Created `/lib/rateLimit/middleware.ts` - Middleware factory & configs
✅ Existing `/lib/rate-limiter.ts` - Token bucket fallback

### Step 2: Update Endpoints (IN PROGRESS)

#### Pattern for Each Endpoint

```typescript
import { createRateLimitMiddleware, addRateLimitHeaders, RATE_LIMIT_CONFIGS } from '@/lib/rateLimit/middleware'

// Create rate limiter at module level
const rateLimitMiddleware = createRateLimitMiddleware(RATE_LIMIT_CONFIGS.{endpoint})

// In handler function
export async function POST(request: NextRequest) {
  // FIRST: Apply rate limiting before any other logic
  const rateLimitCheck = await rateLimitMiddleware(request)
  if (!rateLimitCheck.allowed) {
    return rateLimitCheck.response!
  }

  // ... existing logic ...

  // LAST: Add rate limit headers to successful response
  let response = NextResponse.json(/* data */)
  response = addRateLimitHeaders(
    response,
    rateLimitCheck.remaining!,
    rateLimitCheck.resetTime!,
    rateLimitCheck.limit!
  )
  return response
}
```

#### Endpoints to Update (11 total)

| Endpoint | Config | Limit | Window | Status |
|----------|--------|-------|--------|--------|
| `/api/auth` | `auth` | 5 | 60s | ✅ DONE |
| `/api/health` | `health` | 100 | 60s | ✅ DONE |
| `/api/metrics` | `metrics` | 50 | 60s | ✅ DONE |
| `/api/auth/login` | `authLogin` | 5 | 60s | ⏳ TODO |
| `/api/auth/verify` | `authVerify` | 10 | 60s | ⏳ TODO |
| `/api/profiles` | `profiles` | 30 | 60s | ⏳ TODO |
| `/api/meetings` | `meetings` | 20 | 60s | ⏳ TODO |
| `/api/alerts` | `alerts` | 40 | 60s | ⏳ TODO |
| `/api/kanban` | `kanban` | 30 | 60s | ⏳ TODO |
| `/api/brain` | `brain` | 25 | 60s | ⏳ TODO |
| `/api/conductor` | `conductor` | 15 | 60s | ⏳ TODO |

### Step 3: Update Remaining Endpoints

#### `/api/auth/login/route.ts`
```typescript
// Add at top
import { createRateLimitMiddleware, addRateLimitHeaders, RATE_LIMIT_CONFIGS } from '@/lib/rateLimit/middleware'
const rateLimitMiddleware = createRateLimitMiddleware(RATE_LIMIT_CONFIGS.authLogin)

// In POST handler - add before JSON parsing
const rateLimitCheck = await rateLimitMiddleware(request)
if (!rateLimitCheck.allowed) {
  return rateLimitCheck.response!
}

// Add to response before return
response = addRateLimitHeaders(response, rateLimitCheck.remaining!, rateLimitCheck.resetTime!, rateLimitCheck.limit!)
```

#### `/api/auth/verify/route.ts`
- Same pattern as auth/login but with `RATE_LIMIT_CONFIGS.authVerify`

#### `/api/profiles/route.ts`
- Pattern: Use `RATE_LIMIT_CONFIGS.profiles` (30 requests/60s)
- Apply to both GET and POST handlers

#### `/api/meetings/route.ts`
- Pattern: Use `RATE_LIMIT_CONFIGS.meetings` (20 requests/60s)
- Apply to GET, POST, PUT, DELETE handlers

#### `/api/alerts/route.ts`
- Pattern: Use `RATE_LIMIT_CONFIGS.alerts` (40 requests/60s)
- Apply to GET and POST handlers

#### `/api/kanban/route.ts`
- Pattern: Use `RATE_LIMIT_CONFIGS.kanban` (30 requests/60s)
- Apply to all handlers

#### `/api/brain/route.ts`
- Pattern: Use `RATE_LIMIT_CONFIGS.brain` (25 requests/60s)
- Apply to all handlers

#### `/api/conductor/route.ts`
- Pattern: Use `RATE_LIMIT_CONFIGS.conductor` (15 requests/60s)
- Apply to all handlers

## Response Format

### Successful Response (200-299)
```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 2
X-RateLimit-Reset: 1666451234
Content-Type: application/json

{ "data": "..." }
```

### Rate Limited Response (429)
```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1666451234
Retry-After: 45
Content-Type: application/json

{ "error": "Rate limit exceeded", "retryAfter": 45 }
```

## Testing Strategy

### Unit Tests
- Test rate limiter storage (increment, reset, cleanup)
- Test middleware with mock requests
- Test header generation

### Integration Tests
- Concurrent requests to same endpoint
- Requests from different IPs
- Window expiration
- Cleanup verification

### Load Tests
- Burst traffic (100+ req/sec)
- Sustained traffic over 5+ minutes
- Multiple endpoints simultaneously

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Lookup time | O(1) - HashMap lookup |
| Increment time | O(1) - Direct write |
| Memory per key | ~100 bytes |
| Cleanup overhead | Negligible (runs every 60s) |
| Typical memory usage | 10-100MB (1M-10M unique IPs) |

## Security Considerations

### DDoS Protection
- Tight limits on auth endpoints prevent brute force (5 req/min)
- Higher limits on public endpoints allow legitimate traffic
- IP-based tracking prevents single-user exhaustion

### Rate Limit Bypass Prevention
- Sliding window (not fixed window) prevents burst attacks
- Automatic cleanup prevents memory leaks
- Headers included on all responses (no information leakage)

### Sensitive Endpoints
- Auth (5 req/min) - Prevents credential stuffing
- Login (5 req/min) - Prevents brute force
- Verify (10 req/min) - Allows token validation

### Headers Included
- `X-RateLimit-Limit` - Maximum requests
- `X-RateLimit-Remaining` - Requests left
- `X-RateLimit-Reset` - Unix timestamp when limit resets
- `Retry-After` - Seconds to wait (on 429 only)

## Configuration for Different Scenarios

### Development (Local)
```typescript
const RATE_LIMIT_CONFIGS = {
  auth: { windowMs: 60 * 1000, maxRequests: 100 }, // Very high for testing
  // ... etc
}
```

### Staging
```typescript
const RATE_LIMIT_CONFIGS = {
  auth: { windowMs: 60 * 1000, maxRequests: 20 }, // Moderate
  // ... etc
}
```

### Production (Current)
```typescript
const RATE_LIMIT_CONFIGS = {
  auth: { windowMs: 60 * 1000, maxRequests: 5 }, // Tight
  // ... etc
}
```

## Deployment Checklist

- [ ] All 11 endpoints updated with rate limiting
- [ ] Unit tests pass (>80% coverage)
- [ ] Integration tests pass (concurrent requests)
- [ ] Load tests pass (1000+ req/sec)
- [ ] Headers verified in all responses
- [ ] Error handling verified (429 response format)
- [ ] Cleanup verified (no memory leaks)
- [ ] Monitoring configured (X-RateLimit-* tracking)
- [ ] Documentation updated (API docs)
- [ ] Client instructions shared (retry logic)

## Monitoring & Alerts

### Metrics to Track
- Rate limit hits (429 responses)
- 95th percentile response time
- Memory usage (store size)
- Unique IP addresses

### Alert Thresholds
- Alert if 429s > 5% of traffic
- Alert if memory usage > 500MB
- Alert if cleanup takes > 100ms

## Client Implementation

Clients should implement exponential backoff when receiving 429:

```typescript
async function apiCall(url, options) {
  let retries = 0
  const maxRetries = 3
  
  while (retries < maxRetries) {
    const response = await fetch(url, options)
    
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60')
      await new Promise(r => setTimeout(r, retryAfter * 1000 * Math.pow(2, retries)))
      retries++
      continue
    }
    
    return response
  }
  
  throw new Error('Max retries exceeded')
}
```

## Verification Commands

### Check rate limiting is working
```bash
# Make 6 rapid requests to auth endpoint (should block on 6th)
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth \
    -H "Content-Type: application/json" \
    -d '{"userId":"test","email":"test@test.com"}' \
    -w "\nStatus: %{http_code}\n"
  echo "---"
done
```

### Monitor rate limit headers
```bash
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","email":"test@test.com"}' \
  -v 2>&1 | grep -i "x-ratelimit\|retry-after"
```

## Next Steps

1. ✅ Core infrastructure created
2. ✅ Auth endpoints (3) updated
3. ⏳ Health/Metrics endpoints (2) - START HERE
4. ⏳ Data endpoints (4) - profiles, meetings, alerts, kanban
5. ⏳ Service endpoints (2) - brain, conductor
6. ⏳ Comprehensive test suite
7. ⏳ Performance testing
8. ⏳ Production deployment

## Summary

**Total Work**: 11 endpoints × 5 minutes each = ~55 minutes
**Current Progress**: 3/11 endpoints done (27%)
**Remaining**: 8/11 endpoints + comprehensive tests

**Next Immediate Action**: Update auth/login, auth/verify, then data endpoints
