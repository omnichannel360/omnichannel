/**
 * Rate Limiter Tests
 */

import {
  TokenBucketRateLimiter,
  InMemoryRateLimitStore,
  RateLimitPresets,
  getClientIp,
  createRateLimitHeaders,
} from '@/lib/rate-limiter'

describe('InMemoryRateLimitStore', () => {
  let store: InMemoryRateLimitStore

  beforeEach(() => {
    store = new InMemoryRateLimitStore()
  })

  test('increments counter correctly', async () => {
    const count1 = await store.increment('test-key')
    const count2 = await store.increment('test-key')

    expect(count1).toBe(1)
    expect(count2).toBe(2)
  })

  test('returns null for non-existent key', async () => {
    const count = await store.get('non-existent')
    expect(count).toBeNull()
  })

  test('resets key correctly', async () => {
    await store.increment('test-key')
    await store.reset('test-key')

    const count = await store.get('test-key')
    expect(count).toBeNull()
  })

  test('resets counter on new window', async () => {
    const count1 = await store.increment('test-key')
    expect(count1).toBe(1)

    // Manually clear to simulate window reset
    await store.reset('test-key')

    const count2 = await store.increment('test-key')
    expect(count2).toBe(1)
  })
})

describe('TokenBucketRateLimiter', () => {
  let limiter: TokenBucketRateLimiter
  let store: InMemoryRateLimitStore

  beforeEach(() => {
    store = new InMemoryRateLimitStore()
    limiter = new TokenBucketRateLimiter(
      { maxRequests: 5, windowMs: 60000 },
      store
    )
  })

  test('generates unique keys for different endpoints', () => {
    const key1 = limiter.generateKey('192.168.1.1', '/api/auth')
    const key2 = limiter.generateKey('192.168.1.1', '/api/health')

    expect(key1).not.toBe(key2)
  })

  test('generates unique keys for different IPs', () => {
    const key1 = limiter.generateKey('192.168.1.1', '/api/auth')
    const key2 = limiter.generateKey('192.168.1.2', '/api/auth')

    expect(key1).not.toBe(key2)
  })

  test('includes userId in key when provided', () => {
    const key1 = limiter.generateKey('192.168.1.1', '/api/auth', 'user123')
    const key2 = limiter.generateKey('192.168.1.1', '/api/auth')

    expect(key1).not.toBe(key2)
    expect(key1).toContain('user123')
  })

  test('allows requests within limit', async () => {
    const key = 'test-key'

    for (let i = 1; i <= 5; i++) {
      const { allowed } = await limiter.isAllowed(key)
      expect(allowed).toBe(true)
    }
  })

  test('blocks requests exceeding limit', async () => {
    const key = 'test-key'

    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      await limiter.isAllowed(key)
    }

    // Next request should be blocked
    const { allowed } = await limiter.isAllowed(key)
    expect(allowed).toBe(false)
  })

  test('calculates remaining requests correctly', async () => {
    const key = 'test-key'

    const result1 = await limiter.isAllowed(key)
    expect(result1.remaining).toBe(4) // 5 - 1

    const result2 = await limiter.isAllowed(key)
    expect(result2.remaining).toBe(3) // 5 - 2

    const result5 = await limiter.isAllowed(key)
    const result6 = await limiter.isAllowed(key)
    const result7 = await limiter.isAllowed(key)

    expect(result7.remaining).toBe(0)
  })

  test('resets key correctly', async () => {
    const key = 'test-key'

    // Use up all requests
    for (let i = 0; i < 5; i++) {
      await limiter.isAllowed(key)
    }

    // Verify limit exceeded
    let result = await limiter.isAllowed(key)
    expect(result.allowed).toBe(false)

    // Reset
    await limiter.resetKey(key)

    // Verify limit reset
    result = await limiter.isAllowed(key)
    expect(result.allowed).toBe(true)
  })

  test('returns reset time in isAllowed response', async () => {
    const key = 'test-key'
    const beforeRequest = Date.now()

    const { resetTime } = await limiter.isAllowed(key)

    expect(resetTime).toBeGreaterThan(beforeRequest)
    expect(resetTime).toBeLessThanOrEqual(beforeRequest + 60000)
  })
})

describe('RateLimitPresets', () => {
  test('auth preset has strict limits', () => {
    expect(RateLimitPresets.auth.maxRequests).toBe(5)
    expect(RateLimitPresets.auth.windowMs).toBe(60000)
  })

  test('health preset has no limits', () => {
    expect(RateLimitPresets.health.maxRequests).toBe(Number.MAX_SAFE_INTEGER)
  })

  test('api preset has moderate limits', () => {
    expect(RateLimitPresets.api.maxRequests).toBe(100)
    expect(RateLimitPresets.api.windowMs).toBe(15 * 60 * 1000)
  })

  test('webhook preset has strict limits', () => {
    expect(RateLimitPresets.webhook.maxRequests).toBe(50)
  })
})

describe('getClientIp', () => {
  test('extracts IP from x-forwarded-for header', () => {
    const ip = getClientIp({
      'x-forwarded-for': '192.168.1.1, 10.0.0.1',
    })

    expect(ip).toBe('192.168.1.1')
  })

  test('handles single IP in x-forwarded-for', () => {
    const ip = getClientIp({
      'x-forwarded-for': '192.168.1.1',
    })

    expect(ip).toBe('192.168.1.1')
  })

  test('extracts IP from x-real-ip header', () => {
    const ip = getClientIp({
      'x-real-ip': '192.168.1.1',
    })

    expect(ip).toBe('192.168.1.1')
  })

  test('prioritizes x-forwarded-for over x-real-ip', () => {
    const ip = getClientIp({
      'x-forwarded-for': '192.168.1.1',
      'x-real-ip': '10.0.0.1',
    })

    expect(ip).toBe('192.168.1.1')
  })

  test('returns unknown for missing headers', () => {
    const ip = getClientIp({})
    expect(ip).toBe('unknown')
  })
})

describe('createRateLimitHeaders', () => {
  test('creates correct rate limit headers', () => {
    const headers = createRateLimitHeaders(10, Date.now() + 60000, 100)

    expect(headers['RateLimit-Limit']).toBe('100')
    expect(headers['RateLimit-Remaining']).toBe('10')
    expect(headers['RateLimit-Reset']).toBeDefined()
    expect(headers['Retry-After']).toBeDefined()
  })

  test('retry-after header is within reasonable bounds', () => {
    const resetTime = Date.now() + 30000
    const headers = createRateLimitHeaders(0, resetTime, 100)

    const retryAfter = parseInt(headers['Retry-After'], 10)
    expect(retryAfter).toBeGreaterThanOrEqual(29)
    expect(retryAfter).toBeLessThanOrEqual(31)
  })
})
