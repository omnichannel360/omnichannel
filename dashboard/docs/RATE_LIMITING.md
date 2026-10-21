# Rate Limiting Implementation Guide

## Overview

This document describes the rate limiting implementation for all API endpoints in the OmniForge Dashboard. Rate limiting protects your API from abuse, brute force attacks, and resource exhaustion.

## Architecture

### Components

1. **`lib/rate-limiting.ts`** - Core rate limiting engine
   - In-memory sliding window rate limiter
   - Configurable per-endpoint limits
   - Automatic cleanup of expired entries
   - IP-based and user-based rate limiting

2. **`lib/api-rate-limit-middleware.ts`** - Middleware helpers
   - `applyRateLimit()` - Apply rate limiting to a route
   - `withMiddleware()` - Composite middleware wrapper
   - Helper functions for route handlers

3. **`middleware.ts`** - Global middleware
   - Applies rate limiting at the request level
   - Enforces limits before reaching route handlers
   - Cascades with authentication

## Rate Limits Configuration

### Endpoint Limits (per minute)

| Endpoint | Limit | Strategy | Notes |
|----------|-------|----------|-------|
| `/api/auth/login` | 5 | IP-based | Prevents brute force attacks |
| `/api/auth/verify` | 10 | IP-based | Moderate limit for token verification |
| `/api/auth` | 5 | IP-based | General auth endpoint |
| `/api/brain` | 10 | User-based | AI operations are expensive |
| `/api/alerts` | 50 | User-based | Standard protected endpoint |
| `/api/conductor` | 50 | User-based | Standard protected endpoint |
| `/api/kanban` | 100 | User-based | High-frequency endpoint |
| `/api/meetings` | 50 | User-based | Standard protected endpoint |
| `/api/metrics` | 100 | User-based | High-frequency endpoint |
| `/api/profiles` | 50 | User-based | Standard protected endpoint |

### Strategies

- **IP-based**: Rate limits apply per client IP address
  - Used for unauthenticated endpoints (auth, login)
  - Prevents distributed brute force attacks
  - Key format: `ip:192.168.1.1`

- **User-based**: Rate limits apply per authenticated user
  - Used for protected endpoints
  - Different users have independent limits
  - Falls back to IP-based if not authenticated
  - Key format: `user:user-id-123`

## Usage

### Option 1: Global Middleware (Recommended)

Rate limiting is automatically applied in `middleware.ts` for all routes:

```typescript
// All /api/* routes are protected by rate limiting
// No additional code needed in route handlers
export async function GET(request: NextRequest) {
  // Rate limit already applied by middleware
  return NextResponse.json({ data: 'value' })
}
```

### Option 2: Per-Route Middleware

Apply rate limiting selectively in route handlers:

```typescript
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'

export async function POST(request: NextRequest) {
  // Apply rate limiting for this endpoint
  const rateLimitError = await applyRateLimit(request, 'alerts')
  if (rateLimitError) {
    return rateLimitError
  }

  // Your handler code here
  return NextResponse.json({ success: true })
}
```

### Option 3: Custom Rate Limiter

Create a custom rate limiter for specific use cases:

```typescript
import { createRateLimiter } from '@/lib/rate-limiting'

const customLimiter = createRateLimiter({
  maxRequests: 20,
  windowMs: 60000, // 1 minute
  keyGenerator: (request) => {
    return request.headers.get('x-api-key') || 'unknown'
  }
})

export async function POST(request: NextRequest) {
  const error = await customLimiter(request)
  if (error) return error

  // Your handler code
}
```

## Rate Limit Headers

When a request is rate limited, the response includes:

```
X-RateLimit-Limit: 5         # Maximum requests per window
X-RateLimit-Remaining: 3     # Requests remaining in current window
X-RateLimit-Reset: 1234567   # Unix timestamp when limit resets
```

The client can use these headers to:
- Display remaining quota to the user
- Back off before hitting the limit
- Retry after the reset time

## Error Responses

When a rate limit is exceeded, the API returns:

```json
{
  "success": false,
  "error": "Too many requests, please try again later."
}
```

Status code: **429 Too Many Requests**

## Storage

### In-Memory Store

Rate limit data is stored in memory (`Map<string, RateLimitStore>`):

- **Pros**: Fast, no external dependencies, suitable for single-instance deployments
- **Cons**: Data lost on server restart, doesn't work for distributed systems

### Automatic Cleanup

The store automatically cleans up expired entries every 60 seconds to prevent memory leaks.

### Migration Path (Future)

For distributed deployments, consider migrating to:
- **Redis**: `redis` + `rate-limit-redis` packages
- **Database**: Supabase with scheduled cleanup jobs
- **External Service**: Services like Cloudflare, AWS API Gateway

## Security Considerations

### 1. IP Spoofing Prevention

The rate limiter checks multiple headers in order:
1. `x-forwarded-for` (proxy/load balancer)
2. `x-real-ip` (nginx reverse proxy)
3. `request.ip` (Node.js default)

**Note**: For production, ensure your load balancer is configured to set these headers correctly.

### 2. Distributed Attacks

IP-based rate limiting is vulnerable to distributed attacks. Consider:
- Implementing CAPTCHA for repeated auth failures
- Blocking suspicious patterns with WAF rules
- Monitoring for coordinated attacks

### 3. User-Based Limits

User-based rate limiting is more accurate but only works for authenticated requests. Unauthenticated requests fall back to IP-based limits.

## Testing

### Manual Testing

```bash
# Test login endpoint (5 requests per minute)
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@example.com","password":"test"}' \
    -H "X-Forwarded-For: 192.168.1.100"
done

# The 6th request should return 429
```

### Automated Testing

See `lib/rate-limiting.test.ts` for comprehensive unit tests:

```bash
npm test -- lib/rate-limiting.test.ts
```

## Monitoring

### Key Metrics

1. **Rate limit violations per hour** - Detect potential attacks
2. **Most limited IP addresses** - Identify problem clients
3. **Most limited users** - Identify power users or bugs
4. **Rate limit header propagation** - Verify headers are sent

### Integration

To monitor rate limiting, consider:
- Logging rate limit events
- Sending metrics to analytics
- Alerting on spike detection

Example logging:

```typescript
if (rateLimitError) {
  console.warn(`Rate limit exceeded for ${key}`, {
    endpoint: pathname,
    remaining: 0,
    timestamp: new Date().toISOString(),
  })
  return rateLimitError
}
```

## Troubleshooting

### "Too many requests" error

**Cause**: You've exceeded the rate limit for your IP/user

**Solution**:
- Wait for the time specified in `X-RateLimit-Reset` header
- Check if the header includes `Retry-After` for retry timing
- Implement exponential backoff in client code

### Rate limits not being enforced

**Cause**: Global middleware might be disabled or route doesn't match

**Solution**:
1. Check `middleware.ts` matches your route pattern
2. Verify middleware is exported with correct config
3. Check Next.js version (requires Next.js 12+)
4. Add per-route rate limiting as fallback

### High rate limit violations

**Cause**: Legitimate traffic spike, or attacker

**Solution**:
1. Check logs for suspicious patterns
2. Implement graduated response (warn -> block)
3. Consider WAF rules at load balancer
4. Adjust limits if legitimate increase

## Configuration Changes

### Adjust Rate Limits

Edit `lib/rate-limiting.ts` and modify the `rateLimiters` object:

```typescript
export const rateLimiters = {
  login: createRateLimiter({
    maxRequests: 10,  // Increase from 5
    windowMs: 60 * 1000,
  }),
}
```

### Add New Endpoint

1. Add to `rateLimiters` object:
```typescript
newFeature: createRateLimiter({
  maxRequests: 50,
  windowMs: 60 * 1000,
  keyGenerator: userKeyGenerator,
})
```

2. Update `middleware.ts`:
```typescript
} else if (pathname.startsWith('/api/new-feature')) {
  rateLimitResponse = await withRateLimit(request, rateLimiters.newFeature)
}
```

3. (Optional) Apply in route handler:
```typescript
const rateLimitError = await applyRateLimit(request, 'newFeature')
```

## Best Practices

1. **Start conservative**: Begin with low limits and increase based on monitoring
2. **Different limits for different users**: Consider tiered limits based on subscription
3. **Log violations**: Track which endpoints and IPs hit limits most
4. **Communicate clearly**: Inform clients through headers and error messages
5. **Monitor the monitor**: Ensure rate limiting itself doesn't become a bottleneck
6. **Plan for scale**: If you outgrow in-memory store, migrate to Redis early

## Performance Impact

- **Memory usage**: ~100 bytes per active client per minute
- **CPU overhead**: <1ms per request (negligible)
- **Network latency**: Added headers add ~40 bytes per response

For 1000 concurrent users: ~100KB memory overhead

## References

- [RFC 6585 - HTTP 429 Too Many Requests](https://tools.ietf.org/html/rfc6585)
- [OWASP - Denial of Service Protection](https://owasp.org/www-community/attacks/DoS_attack)
- [Rate Limiting Patterns](https://stripe.com/blog/rate-limiting)
