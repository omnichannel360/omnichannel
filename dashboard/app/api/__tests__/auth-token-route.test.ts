/**
 * POST /api/auth must only issue tokens to an authenticated admin.
 * Regression: the route minted admin JWTs for anonymous callers
 * (.specify/bugs/auth-token-mint-unauthenticated).
 */
import { NextRequest } from 'next/server'
import { generateToken, generateRefreshToken } from '@/lib/auth'

// Isolate route logic from the shared in-memory rate limiter
jest.mock('@/lib/rateLimit/middleware', () => ({
  createRateLimitMiddleware: jest.fn(() => async () => ({
    allowed: true,
    remaining: 4,
    resetTime: Date.now() + 60_000,
    limit: 5,
  })),
  addRateLimitHeaders: jest.fn((response: unknown) => response),
  RATE_LIMIT_CONFIGS: { auth: { maxRequests: 5, windowMs: 60_000 } },
}))

const TEST_SECRET = 'test-secret-for-auth-token-route-0123456789'
const originalSecret = process.env.JWT_SECRET

function tokenRequest(authorization?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authorization) headers.authorization = authorization
  return new NextRequest('http://localhost/api/auth', {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId: 'attacker', email: 'attacker@example.com', role: 'admin' }),
  })
}

describe('POST /api/auth - caller authorization', () => {
  let POST: (request: NextRequest) => Promise<Response>

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET
    ;({ POST } = await import('@/app/api/auth/route'))
  })

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET
    } else {
      process.env.JWT_SECRET = originalSecret
    }
  })

  it('rejects an anonymous caller with 401 and issues no token', async () => {
    const response = await POST(tokenRequest())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(JSON.stringify(body)).not.toContain('accessToken')
  })

  it('rejects an invalid bearer token with 401', async () => {
    const response = await POST(tokenRequest('Bearer not-a-real-jwt'))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(JSON.stringify(body)).not.toContain('accessToken')
  })

  it('rejects a non-admin caller with 403', async () => {
    const userToken = await generateToken('regular-user', 'user@example.com', 'user', 60)
    const response = await POST(tokenRequest(`Bearer ${userToken}`))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(JSON.stringify(body)).not.toContain('accessToken')
  })

  it('rejects a refresh token presented as a bearer credential', async () => {
    const refreshToken = await generateRefreshToken('admin-user', 'admin@example.com', 60)
    const response = await POST(tokenRequest(`Bearer ${refreshToken}`))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(JSON.stringify(body)).not.toContain('accessToken')
  })

  it('issues tokens to an authenticated admin', async () => {
    const adminToken = await generateToken('admin-user', 'admin@example.com', 'admin', 60)
    const response = await POST(tokenRequest(`Bearer ${adminToken}`))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(typeof body.data.accessToken).toBe('string')
    expect(typeof body.data.refreshToken).toBe('string')
  })
})
