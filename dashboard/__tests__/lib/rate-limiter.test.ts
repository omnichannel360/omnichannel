/**
 * Rate Limiter Tests
 */

import {
  RateLimiter,
  InMemoryRateLimitStore,
  RateLimitPresets,
  getClientIp,
  createRateLimitHeaders,
} from '@/lib/rate-limiter'

describe('InMemoryRateLimitStore', () => {
  let store: InMemoryRateLimitStore

  beforeEach(() => {
    store = new InMemoryRateLimitStore(60000)
  })

  test('increments counter correctly', async () => {
    const result1 = await store.increment('test-key')
    const result2 = await store.increment('test-key')

    expect(result1.count).toBe(1)
    expect(result2.count).toBe(2)
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
    const result1 = await store.increment('test-key')
    expect(result1.count).toBe(1)

    // Manually clear to simulate window reset
    await store.reset('test-key')

    const result2 = await store.increment('test-key')
    expect(result2.count).toBe(1)
  })
})

describe('RateLimiter', () => {
  let limiter: RateLimiter
  let store: InMemoryRateLimitStore

  beforeEach(() => {
    store = new InMemoryRateLimitStore(60000)
    limiter = new RateLimiter({
      requestsPerWindow: 5,
      windowMs: 60000,
      tier: 'authenticated',
      keyPrefix: 'test:rl',
    })
  })

  test('allows requests within limit', async () => {
    for (let i = 1; i <= 5; i++) {
      const result = await limiter.check('192.168.1.1')
      expect(result.allowed).toBe(true)
    }

  afterEach(() => {
    vi.clearAllMocks()
  })
  })

  test('blocks requests exceeding limit', async () => {
    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      await limiter.check('192.168.1.1')
    }

    // Next request should be blocked
    const result = await limiter.check('192.168.1.1')
    expect(result.allowed).toBe(false)
  })

  test('distinguishes between different IPs', async () => {
    const result1 = await limiter.check('192.168.1.1')
    const result2 = await limiter.check('192.168.1.2')

    // Both should be allowed because they have different IP limits
    expect(result1.allowed).toBe(true)
    expect(result2.allowed).toBe(true)
  })

  test('distinguishes between different users', async () => {
    const result1 = await limiter.check('192.168.1.1', 'user1')
    const result2 = await limiter.check('192.168.1.1', 'user2')

    // Both should be allowed because they have different user limits
    expect(result1.allowed).toBe(true)
    expect(result2.allowed).toBe(true)
  })

  test('calculates remaining requests correctly', async () => {
    const result1 = await limiter.check('192.168.1.1')
    expect(result1.remaining).toBe(4) // 5 - 1

    const result2 = await limiter.check('192.168.1.1')
    expect(result2.remaining).toBe(3) // 5 - 2

    await limiter.check('192.168.1.1')
    await limiter.check('192.168.1.1')
    const result5 = await limiter.check('192.168.1.1')

    expect(result5.remaining).toBe(0)
  })

  test('resets key correctly', async () => {
    // Use up all requests
    for (let i = 0; i < 5; i++) {
      await limiter.check('192.168.1.1')
    }

    // Verify limit exceeded
    let result = await limiter.check('192.168.1.1')
    expect(result.allowed).toBe(false)

    // Reset
    await limiter.reset('192.168.1.1')

    // Verify limit reset
    result = await limiter.check('192.168.1.1')
    expect(result.allowed).toBe(true)
  })

  test('returns reset time in check response', async () => {
    const beforeRequest = Date.now()

    const result = await limiter.check('192.168.1.1')

    expect(result.resetAt).toBeGreaterThan(beforeRequest)
    expect(result.resetAt).toBeLessThanOrEqual(beforeRequest + 60000)
  })
})

describe('RateLimitPresets', () => {
  test('auth preset has strict limits', () => {
    expect(RateLimitPresets.auth.requestsPerWindow).toBe(5)
    expect(RateLimitPresets.auth.windowMs).toBe(60000)
  })

  test('health preset has no limits', () => {
    expect(RateLimitPresets.health.requestsPerWindow).toBe(Number.MAX_SAFE_INTEGER)
  })

  test('api preset has moderate limits', () => {
    expect(RateLimitPresets.api.requestsPerWindow).toBe(100)
    expect(RateLimitPresets.api.windowMs).toBe(15 * 60 * 1000)
  })

  test('webhook preset has strict limits', () => {
    expect(RateLimitPresets.webhook.requestsPerWindow).toBe(50)
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

  test('returns anonymous for missing headers', () => {
    const ip = getClientIp({})
    expect(ip).toBe('anonymous')
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
