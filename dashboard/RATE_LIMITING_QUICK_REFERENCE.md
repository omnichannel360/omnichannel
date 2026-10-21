# Rate Limiting - Quick Reference Guide

## TL;DR

Rate limiting has been implemented on all API endpoints to prevent abuse. Most endpoints now return `429 Too Many Requests` when rate limits are exceeded.

## Rate Limits by Endpoint

```
POST   /api/auth/login                 → 5 requests / 1 minute
POST   /api/auth                       → 5 requests / 1 minute  
GET    /api/auth/verify                → 30 requests / 1 minute
GET    /api/health                     → 120 requests / 1 minute
GET    /api/alerts                     → 20 requests / 1 minute
POST   /api/alerts                     → 20 requests / 1 minute
PATCH  /api/alerts/{id}                → 20 requests / 1 minute
GET    /api/metrics                    → 30 requests / 1 minute
GET    /api/profiles                   → 30 requests / 1 minute
GET    /api/meetings                   → 10 requests / 1 minute
POST   /api/meetings                   → 10 requests / 1 minute
GET    /api/kanban                     → 20 requests / 1 minute
GET    /api/conductor                  → 15 requests / 1 minute
GET    /api/brain                      → 10 requests / 1 minute
```

## Response Headers

Every response includes rate limit information:

```http
RateLimit-Limit: 100           # Total requests allowed
RateLimit-Remaining: 45        # Requests left in current window
RateLimit-Reset: 1698765432    # Unix timestamp when limit resets
Retry-After: 60                # Seconds to wait before retrying
```

## When You Hit the Rate Limit

**Status Code**: `429 Too Many Requests`

**Response Body**:
```json
{
  "error": "Too many requests, please try again later",
  "retryAfter": 60,
  "statusCode": 429
}
```

**What to do**:
1. Wait for `Retry-After` seconds before retrying
2. Check `RateLimit-Reset` header for exact reset time
3. Consider implementing exponential backoff in your client
4. Contact support if you need higher limits

## Integration for Developers

### Adding Rate Limiting to a New Endpoint

```typescript
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/middleware/rateLimit'

// Create your handler
async function handler(request: NextRequest) {
  // Your logic here
  return NextResponse.json({ data: 'response' })
}

// Wrap with rate limiting
export const GET = withRateLimit(
  async (request) => handler(request),
  { ...RATE_LIMIT_CONFIGS.standard, endpoint: 'api/my-endpoint' }
)
```

### Rate Limit Presets

```typescript
RATE_LIMIT_CONFIGS.auth      // 5 requests / 1 min (brute force protection)
RATE_LIMIT_CONFIGS.health    // 100 requests / 1 min (monitoring)
RATE_LIMIT_CONFIGS.standard  // 30 requests / 1 min (general APIs)
RATE_LIMIT_CONFIGS.data      // 20 requests / 1 min (data operations)
```

### Custom Limits

```typescript
export const POST = withRateLimit(
  async (request) => handler(request),
  {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 10,         // 10 requests
    message: 'Too many requests, please try again later',
    endpoint: 'api/my-endpoint'
  }
)
```

## Testing Locally

### Test Authentication Rate Limiting

```bash
# Make 5 requests (should succeed)
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@example.com","password":"test"}'
  echo "Request $i succeeded"
done

# Make 6th request (should fail with 429)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"test"}'
# Returns 429 Too Many Requests
```

### Check Rate Limit Headers

```bash
curl -i http://localhost:3000/api/health
```

Response includes:
```
RateLimit-Limit: 120
RateLimit-Remaining: 119
RateLimit-Reset: 1698765432
Retry-After: 60
```

## Client Implementation Examples

### JavaScript/Fetch

```typescript
async function fetchWithRetry(url: string, options = {}) {
  let response = await fetch(url, options)
  
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '60')
    console.log(`Rate limited. Retrying after ${retryAfter}s`)
    
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
    response = await fetch(url, options) // Retry
  }
  
  return response
}

// Usage
const response = await fetchWithRetry('http://localhost/api/alerts')
```

### Python Requests

```python
import time
import requests

def fetch_with_retry(url, **kwargs):
    response = requests.get(url, **kwargs)
    
    if response.status_code == 429:
        retry_after = int(response.headers.get('Retry-After', 60))
        print(f"Rate limited. Retrying after {retry_after}s")
        time.sleep(retry_after)
        response = requests.get(url, **kwargs)
    
    return response

# Usage
response = fetch_with_retry('http://localhost/api/alerts')
```

### cURL with Backoff

```bash
#!/bin/bash

function curl_with_backoff() {
  local url=$1
  local retries=3
  local wait_time=2
  
  while [ $retries -gt 0 ]; do
    response=$(curl -s -w "\n%{http_code}" "$url")
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" = "429" ]; then
      echo "Rate limited. Waiting ${wait_time}s..."
      sleep $wait_time
      wait_time=$((wait_time * 2))
      retries=$((retries - 1))
    else
      echo "$response" | head -n-1
      return 0
    fi
  done
  
  echo "Failed after retries"
  return 1
}

curl_with_backoff "http://localhost/api/alerts"
```

## Monitoring & Support

### Check Current Rate Limit Status

Include this in your client to log rate limit status:

```typescript
// After any API call
const remaining = response.headers.get('RateLimit-Remaining')
const limit = response.headers.get('RateLimit-Limit')
const resetTime = response.headers.get('RateLimit-Reset')

console.log(`Rate limit: ${remaining}/${limit}, resets at ${new Date(parseInt(resetTime) * 1000)}`)
```

### Common Rate Limit Issues

**Problem**: Getting 429 errors immediately after app start  
**Cause**: Previous requests from same IP still in rate limit window  
**Solution**: The limit resets after 1-15 minutes depending on endpoint

**Problem**: Different rate limits on staging vs production  
**Cause**: Configuration differences  
**Solution**: Check `lib/rate-limit-config.ts` for environment-specific settings

**Problem**: Rate limiting affecting legitimate monitoring tools  
**Cause**: Monitoring makes many requests  
**Solution**: Use different IP for monitoring or contact support for whitelist

## Architecture Overview

```
Request → IP Extraction → Rate Limiter → Store Check
                                ↓
                         Within Limit? 
                         /          \
                       YES           NO
                        ↓             ↓
                   Handler        429 Response
                        ↓             ↓
                   Response    RateLimit Headers
```

## Technical Details

### Rate Limiting Algorithm

**Token Bucket**:
- Bucket starts with `maxRequests` tokens
- Each request costs 1 token
- Tokens refill when window resets
- No request allowed if bucket empty

**Window**: Fixed time window (default 1 minute)  
**Storage**: In-memory (per server)  
**Performance**: <1ms per request  

### IP Extraction

Rate limiter identifies clients via:
1. `x-forwarded-for` header (load balancers)
2. `x-real-ip` header (proxies)
3. Direct connection IP (fallback)

## Troubleshooting

### 429 Errors But Not Hitting Limit

**Check**:
1. Are you using the correct IP? (Proxy might show different IP)
2. Is the rate limit window correct? (Check headers)
3. Are other processes making requests? (Check logs)

**Debug**:
```bash
# Check how many requests your IP has made
curl -v http://localhost:3000/api/health | grep RateLimit
```

### Rate Limiter Not Working

**Check**:
1. Is middleware imported? `import { withRateLimit }`
2. Is endpoint wrapped? `export const GET = withRateLimit(...)`
3. Check browser console for 429 responses

**Debug**:
```typescript
// Add to your middleware
console.log('Rate limiter active on this endpoint')
```

### Performance Issues

Rate limiting overhead is <1ms per request. If you see slowdowns:
1. Check database queries
2. Check external API calls
3. Profile with DevTools

## FAQ

**Q: Can I get a higher rate limit?**  
A: Contact support or implement caching on your side to reduce requests.

**Q: Do rate limits apply per IP or per user?**  
A: Per IP for anonymous endpoints, can be user-based for authenticated endpoints.

**Q: Are rate limits persistent across server restarts?**  
A: No. Current implementation uses in-memory storage. Limits reset on restart. (Production enhancement: use Redis)

**Q: Can I bypass rate limits with different IPs?**  
A: Yes, but we monitor suspicious patterns and may block.

**Q: Do you have an allowlist for specific IPs?**  
A: Contact support. Allowlists can be added for trusted services.

## Related Documentation

- **Implementation Guide**: `RATE_LIMITING_IMPLEMENTATION.md`
- **Summary**: `RATE_LIMITING_IMPLEMENTATION_SUMMARY.md`  
- **Delivery Report**: `RATE_LIMITING_DELIVERY_REPORT.md`
- **API Docs**: Check endpoint documentation for specific limits
- **Code**: `lib/rate-limiter.ts`, `lib/rate-limit-middleware.ts`

## Support

For rate limiting issues:
1. Check this Quick Reference guide
2. Read RATE_LIMITING_IMPLEMENTATION.md
3. Review test cases in `__tests__/lib/rate-limiter.test.ts`
4. Contact engineering team with:
   - Endpoint being accessed
   - Request rate (requests per minute)
   - IP address (if public)
   - Error response body

---

**Last Updated**: October 22, 2026  
**Status**: Production Ready  
**Questions?** See full documentation in `RATE_LIMITING_IMPLEMENTATION.md`
