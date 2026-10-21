# Redis Rate Limiting Implementation Guide
## Remediation for Distributed Rate Limiting Issue

**Severity:** MEDIUM  
**Priority:** HIGH (Required for production scale)  
**Effort:** 2-3 hours  
**Status:** Not yet implemented  

---

## ISSUE SUMMARY

Current rate limiting implementation uses JavaScript Map, which is per-process. In a load-balanced environment with multiple servers, rate limits can be bypassed by distributing requests.

**Current Implementation (In-Memory):**
```typescript
class RateLimitMemoryStore {
  private store: Map<string, RateLimitStore> = new Map()
  // This is per-process, not shared across servers
}
```

**Problem:** Each server has its own counter. Attack succeeds by hitting multiple servers.

---

## REMEDIATION STEPS

### Step 1: Install Redis Dependency

```bash
npm install ioredis
npm install --save-dev @types/ioredis
```

### Step 2: Create Redis Rate Limit Store

**File:** `dashboard/lib/rateLimit/redis-store.ts`

```typescript
import Redis from 'ioredis'

export interface RedisRateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }>
  get(key: string): Promise<{ count: number; resetTime: number } | null>
  reset(key: string): Promise<void>
}

class RedisStore implements RedisRateLimitStore {
  private redis: Redis

  constructor(redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.redis = new Redis(redisUrl)
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    // INCR is atomic — even in distributed setup, only one process increments at a time
    const count = await this.redis.incr(key)

    // Set TTL on first increment
    if (count === 1) {
      const windowSeconds = Math.ceil(windowMs / 1000)
      await this.redis.expire(key, windowSeconds)
    }

    // Get current TTL to calculate reset time
    const ttl = await this.redis.ttl(key) // in seconds
    const resetTime = Date.now() + (ttl * 1000)

    return { count, resetTime }
  }

  async get(key: string): Promise<{ count: number; resetTime: number } | null> {
    const count = await this.redis.get(key)
    
    if (count === null) {
      return null
    }

    const ttl = await this.redis.ttl(key) // in seconds
    const resetTime = Date.now() + (ttl * 1000)

    return { count: parseInt(count, 10), resetTime }
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key)
  }

  async destroy(): Promise<void> {
    await this.redis.quit()
  }
}

// Singleton instance
let redisStore: RedisStore | null = null

export function getRedisStore(): RedisStore {
  if (!redisStore) {
    redisStore = new RedisStore()
  }
  return redisStore
}
```

### Step 3: Update Middleware to Use Redis

**File:** `dashboard/lib/rateLimit/middleware.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getRedisStore } from './redis-store'
import { createLogger } from '@/lib/logger'

const logger = createLogger('rate-limit-middleware')

export interface RateLimitMiddlewareConfig {
  endpoint: string
  maxRequests: number
  windowMs: number
  getKey?: (request: NextRequest) => string
  onLimitExceeded?: (remaining: number, resetTime: number) => NextResponse
}

function defaultKeyGenerator(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const ip = forwardedFor?.split(',')[0] || realIp || 'unknown'
  return ip.trim()
}

export function createRateLimitMiddleware(config: RateLimitMiddlewareConfig) {
  const store = getRedisStore()
  const keyGenerator = config.getKey || defaultKeyGenerator

  return async (request: NextRequest): Promise<{
    allowed: boolean
    response?: NextResponse
    remaining?: number
    resetTime?: number
    limit?: number
  }> => {
    try {
      const clientKey = keyGenerator(request)
      // Include endpoint in Redis key to avoid collisions
      const key = `rate-limit:${config.endpoint}:${clientKey}`

      // Increment counter atomically across all servers
      const { count, resetTime } = await store.increment(key, config.windowMs)

      const remaining = Math.max(0, config.maxRequests - count)
      const allowed = count <= config.maxRequests

      if (!allowed) {
        const resetTimeSeconds = Math.ceil(resetTime / 1000)
        const retryAfter = Math.ceil((resetTime - Date.now()) / 1000)

        const response =
          config.onLimitExceeded?.(remaining, resetTime) ||
          NextResponse.json(
            {
              error: 'Rate limit exceeded',
              retryAfter,
            },
            { status: 429 }
          )

        response.headers.set('X-RateLimit-Limit', String(config.maxRequests))
        response.headers.set('X-RateLimit-Remaining', '0')
        response.headers.set('X-RateLimit-Reset', String(resetTimeSeconds))
        response.headers.set('Retry-After', String(retryAfter))

        logger.warn('Rate limit exceeded', {
          endpoint: config.endpoint,
          clientKey,
          count,
          limit: config.maxRequests,
          statusCode: 429,
        })

        return { allowed: false, response }
      }

      const resetTimeSeconds = Math.ceil(resetTime / 1000)

      return {
        allowed: true,
        remaining,
        resetTime,
        limit: config.maxRequests,
      }
    } catch (error) {
      // Fallback: allow request if Redis fails (better UX than blocking)
      logger.error('Rate limiting check failed', error, {
        endpoint: config.endpoint,
      })

      // Recommendation: log this and alert, but don't break the API
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetTime: Date.now() + config.windowMs,
        limit: config.maxRequests,
      }
    }
  }
}

export function addRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  resetTime: number,
  limit: number
): NextResponse {
  const resetTimeSeconds = Math.ceil(resetTime / 1000)
  response.headers.set('X-RateLimit-Limit', String(limit))
  response.headers.set('X-RateLimit-Remaining', String(remaining))
  response.headers.set('X-RateLimit-Reset', String(resetTimeSeconds))
  return response
}
```

### Step 4: Update Environment Configuration

**File:** `.env.production`

```bash
# Rate Limiting
REDIS_URL=redis://redis-service:6379
RATE_LIMIT_LOGIN_MAX=5
RATE_LIMIT_LOGIN_WINDOW_MS=60000
RATE_LIMIT_AUTH_MAX=10
RATE_LIMIT_AUTH_WINDOW_MS=60000
RATE_LIMIT_BRAIN_MAX=20
RATE_LIMIT_BRAIN_WINDOW_MS=60000
RATE_LIMIT_PROTECTED_MAX=100
RATE_LIMIT_PROTECTED_WINDOW_MS=60000
```

**File:** `.env` (local development)

```bash
# Local development - Redis optional
REDIS_URL=redis://localhost:6379
```

### Step 5: Add Graceful Fallback

**File:** `dashboard/lib/rateLimit/store.ts`

```typescript
import Redis from 'ioredis'
import { RateLimitMemoryStore } from './memory-store'

let store: RateLimitMemoryStore | RedisStore

export async function initializeRateLimitStore() {
  const redisUrl = process.env.REDIS_URL

  if (!redisUrl) {
    console.warn('[Rate Limiting] REDIS_URL not set. Using in-memory store (single-server only)')
    store = new RateLimitMemoryStore()
    return
  }

  try {
    const redis = new Redis(redisUrl)
    await redis.ping()
    console.log('[Rate Limiting] Connected to Redis, using distributed rate limiting')
    store = new RedisStore(redisUrl)
  } catch (error) {
    console.error('[Rate Limiting] Failed to connect to Redis, falling back to in-memory store', error)
    store = new RateLimitMemoryStore()
  }
}

export function getStore() {
  if (!store) {
    throw new Error('Rate limit store not initialized. Call initializeRateLimitStore() at startup.')
  }
  return store
}
```

### Step 6: Update Server Initialization

**File:** `dashboard/app/api/[[...route]]/route.ts` or your Next.js initialization

```typescript
import { initializeRateLimitStore } from '@/lib/rateLimit/store'

// In your server startup / middleware
if (typeof window === 'undefined') {
  // Server-side initialization
  initializeRateLimitStore().catch(error => {
    console.error('Failed to initialize rate limiting', error)
    process.exit(1)
  })
}
```

### Step 7: Testing

**File:** `dashboard/__tests__/lib/redis-rate-limiting.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Redis from 'ioredis'
import { getRedisStore } from '@/lib/rateLimit/redis-store'

// Skip if Redis not available
const skipIfNoRedis = process.env.REDIS_URL ? describe : describe.skip

skipIfNoRedis('Redis Rate Limiting', () => {
  let redis: Redis

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
    // Clear test keys
    const keys = await redis.keys('rate-limit:test:*')
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  })

  afterAll(async () => {
    await redis.quit()
  })

  it('should increment counter atomically across multiple increments', async () => {
    const store = getRedisStore()
    const key = 'rate-limit:test:concurrent'

    const result1 = await store.increment(key, 1000)
    expect(result1.count).toBe(1)

    const result2 = await store.increment(key, 1000)
    expect(result2.count).toBe(2)

    const result3 = await store.increment(key, 1000)
    expect(result3.count).toBe(3)
  })

  it('should reset counter after window expires', async () => {
    const store = getRedisStore()
    const key = 'rate-limit:test:expiry'
    const windowMs = 1000 // 1 second

    const result1 = await store.increment(key, windowMs)
    expect(result1.count).toBe(1)

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, windowMs + 100))

    const result2 = await store.increment(key, windowMs)
    expect(result2.count).toBe(1) // Counter reset
  })

  it('should handle concurrent requests', async () => {
    const store = getRedisStore()
    const key = 'rate-limit:test:concurrent-requests'

    // Simulate 10 concurrent requests
    const promises = Array(10)
      .fill(null)
      .map(() => store.increment(key, 5000))

    const results = await Promise.all(promises)
    const counts = results.map(r => r.count).sort((a, b) => a - b)

    // Should have 1-10 (all unique)
    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})
```

### Step 8: Docker Compose Setup

**File:** `docker-compose.yml`

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5
    command: redis-server --appendonly yes

  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      REDIS_URL: redis://redis:6379
      NODE_ENV: production
    depends_on:
      redis:
        condition: service_healthy

volumes:
  redis_data:
```

---

## DEPLOYMENT CHECKLIST

- [ ] Redis dependency added (`npm install ioredis`)
- [ ] Redis store implemented (`redis-store.ts`)
- [ ] Middleware updated to use Redis
- [ ] Environment variables configured
- [ ] Graceful fallback implemented (in-memory if Redis unavailable)
- [ ] Initialization added to server startup
- [ ] Redis tests written and passing
- [ ] Docker Compose includes Redis service
- [ ] Load testing confirms distributed rate limiting works
- [ ] Monitoring alerts set up for Redis connection issues

---

## PERFORMANCE IMPACT

**Latency Addition:**
- Redis operation: ~1-2ms per request (typical Redis latency)
- Previous in-memory: <0.1ms

**Net Effect:** ~1-2ms added per request (acceptable for rate limiting check)

**Throughput:**
- Redis can handle 100k+ requests/second
- Not a bottleneck for typical applications

---

## FALLBACK BEHAVIOR

If Redis becomes unavailable:

1. Rate limiting continues with in-memory store
2. Single-server protection maintained
3. Multi-server bypass risk returns (temporarily)
4. Alert fires (log warning)
5. Operations team can respond

**Recommendation:** Monitor Redis availability and alert if connection drops.

---

## MONITORING RECOMMENDATIONS

**Metrics to Track:**
- Redis connection status
- Rate limit hits per endpoint
- Request latency (with Redis vs without)
- Redis memory usage

**Alerts:**
- Redis connection fails
- Rate limit exceeds 50% of threshold
- Unusual spike in 429 responses

**Example Alert (Prometheus):**
```yaml
alert: RateLimitingFailing
expr: redis_up == 0
for: 1m
annotations:
  summary: "Rate limiting Redis connection lost"
  description: "Distributed rate limiting is down. Single-server mode active."
```

---

## ROLLBACK PLAN

If Redis implementation causes issues:

1. Set `REDIS_URL` to empty string or invalid URL
2. Restart app servers
3. In-memory fallback activates automatically
4. Service continues (single-server rate limiting only)
5. Investigate Redis issue
6. Revert code if needed

---

## TIMELINE

**Phase 1 (1 hour):** Install dependencies, implement Redis store  
**Phase 2 (1 hour):** Update middleware, add initialization  
**Phase 3 (30 min):** Write tests, update Docker Compose  
**Phase 4 (30 min):** Deploy to staging, load test  
**Phase 5 (30 min):** Deploy to production with monitoring  

**Total: 3.5 hours**

---

## REFERENCES

- Redis Documentation: https://redis.io/documentation
- ioredis npm: https://www.npmjs.com/package/ioredis
- Rate Limiting Best Practices: https://tools.ietf.org/html/draft-polli-ratelimit-headers-07

---

**Created:** 2026-10-22  
**Status:** Recommended for immediate implementation  
**Next Step:** Create GitHub issue and assign to team
