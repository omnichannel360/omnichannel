/**
 * Auth hardening for service-to-service use (Omni360 integration):
 * - refresh tokens are never accepted as access/session tokens
 * - only HS256 is accepted
 * - client-supplied identity headers (x-user-*, x-auth-verified) never reach handlers
 * - role checks apply to sub-paths of protected routes
 */
import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { middleware, SESSION_COOKIE } from '@/middleware'
import { verifyToken as verifyRouteToken } from '@/lib/auth'

const TEST_JWT_SECRET = 'test-secret-key-auth-hardening'
const SPOOFED_HEADERS = ['x-user-id', 'x-user-email', 'x-user-role', 'x-auth-verified']

function sign(payload: Record<string, unknown>, options: jwt.SignOptions = {}): string {
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h', ...options })
}

function apiRequest(pathname: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`), { method: 'GET', headers })
}

/** Value of a request header as forwarded by NextResponse.next({ request: { headers } }) */
function forwarded(response: Response, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name}`)
}

describe('auth hardening', () => {
  const originalSecret = process.env.JWT_SECRET

  beforeAll(() => {
    process.env.JWT_SECRET = TEST_JWT_SECRET
  })

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret
  })

  describe('middleware: refresh tokens', () => {
    const refresh = (): string =>
      sign({ sub: 'user-1', email: 'u@example.com', role: 'admin', type: 'refresh' })

    it('rejects a refresh token on a protected API route', async () => {
      const response = await middleware(apiRequest('/api/alerts', { authorization: `Bearer ${refresh()}` }))

      expect(response.status).toBe(401)
    })

    it('does not accept a refresh token as a dashboard page session', async () => {
      const request = apiRequest('/', { cookie: `${SESSION_COOKIE}=${refresh()}` })

      const response = await middleware(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/login')
    })

    it('still accepts a normal access token', async () => {
      const token = sign({ sub: 'user-1', email: 'u@example.com', role: 'user' })

      const response = await middleware(apiRequest('/api/alerts', { authorization: `Bearer ${token}` }))

      expect(response.status).toBe(200)
      expect(forwarded(response, 'x-user-role')).toBe('user')
    })
  })

  describe('middleware: token claims', () => {
    it.each([
      ['missing role', { sub: 'user-1', email: 'u@example.com' }],
      ['unknown role', { sub: 'user-1', email: 'u@example.com', role: 'superuser' }],
      ['missing sub', { email: 'u@example.com', role: 'admin' }],
    ])('rejects a token with %s', async (_label, payload) => {
      const response = await middleware(
        apiRequest('/api/metrics', { authorization: `Bearer ${sign(payload)}` })
      )

      expect(response.status).toBe(401)
    })

    it('rejects a token signed with a non-HS256 algorithm', async () => {
      const token = sign({ sub: 'user-1', email: 'u@example.com', role: 'admin' }, { algorithm: 'HS512' })

      const response = await middleware(apiRequest('/api/alerts', { authorization: `Bearer ${token}` }))

      expect(response.status).toBe(401)
    })
  })

  describe('middleware: spoofed identity headers', () => {
    const spoofed = {
      'x-user-id': 'attacker',
      'x-user-email': 'attacker@example.com',
      'x-user-role': 'admin',
      'x-auth-verified': 'true',
    }

    it.each(['/api/health', '/api/auth/login', '/api/unlisted'])(
      'strips client identity headers on public route %s',
      async (pathname) => {
        const response = await middleware(apiRequest(pathname, spoofed))

        const overridden = response.headers.get('x-middleware-override-headers')
        expect(overridden).not.toBeNull()
        for (const name of SPOOFED_HEADERS) {
          expect(overridden?.split(',')).not.toContain(name)
          expect(forwarded(response, name)).toBeNull()
        }
      }
    )

    it('replaces client identity headers with token claims on protected routes', async () => {
      const token = sign({ sub: 'user-1', email: 'u@example.com', role: 'user' })

      const response = await middleware(
        apiRequest('/api/alerts', { ...spoofed, authorization: `Bearer ${token}` })
      )

      expect(forwarded(response, 'x-user-id')).toBe('user-1')
      expect(forwarded(response, 'x-user-role')).toBe('user')
    })
  })

  describe('middleware: route matching', () => {
    const viewer = (): string => sign({ sub: 'v-1', email: 'v@example.com', role: 'viewer' })

    it('applies role checks to sub-paths of protected routes', async () => {
      const response = await middleware(
        apiRequest('/api/alerts/123', { authorization: `Bearer ${viewer()}` })
      )

      expect(response.status).toBe(403)
    })

    it('requires auth on sub-paths of protected routes', async () => {
      const response = await middleware(apiRequest('/api/kanban/abc'))

      expect(response.status).toBe(401)
    })

    it.each(['/api/%61lerts', '/api/alerts%2F1', '/api//alerts', '/api/%6Banban/abc'])(
      'requires auth on encoded or non-canonical path %s',
      async (pathname) => {
        const response = await middleware(apiRequest(pathname))

        expect(response.status).toBe(401)
      }
    )

    it('rejects a malformed percent-encoded path', async () => {
      const response = await middleware(apiRequest('/api/%E0%A4%A'))

      expect(response.status).toBe(400)
    })

    it('keeps viewer access to metrics', async () => {
      const response = await middleware(apiRequest('/api/metrics', { authorization: `Bearer ${viewer()}` }))

      expect(response.status).toBe(200)
    })
  })

  describe('rate-limit IP key', () => {
    // Imported lazily so the module-level store does not leak into other suites
    const keyFor = (xff?: string, realIp?: string): string => {
      const { defaultKeyGenerator } = require('@/lib/rate-limiting') as typeof import('@/lib/rate-limiting')
      const headers: Record<string, string> = {}
      if (xff !== undefined) headers['x-forwarded-for'] = xff
      if (realIp !== undefined) headers['x-real-ip'] = realIp
      return defaultKeyGenerator(apiRequest('/api/auth', headers))
    }

    it('ignores client-prepended x-forwarded-for entries', () => {
      expect(keyFor('1.1.1.1, 203.0.113.9')).toBe(keyFor('2.2.2.2, 203.0.113.9'))
      expect(keyFor('1.1.1.1, 203.0.113.9')).toBe('ip:203.0.113.9')
    })

    it('falls back to x-real-ip, then unknown', () => {
      expect(keyFor(undefined, ' 198.51.100.4 ')).toBe('ip:198.51.100.4')
      expect(keyFor()).toBe('ip:unknown')
    })
  })

  describe('lib/auth verifyToken (route-level re-verification)', () => {
    const routeRequest = (token: string): NextRequest =>
      apiRequest('/api/alerts', { authorization: `Bearer ${token}` })

    it('rejects a refresh token even if it carries a role', async () => {
      const token = sign({ sub: 'user-1', email: 'u@example.com', role: 'admin', type: 'refresh' })

      expect(await verifyRouteToken(routeRequest(token))).toBeNull()
    })

    it('rejects a non-HS256 token', async () => {
      const token = sign({ sub: 'user-1', email: 'u@example.com', role: 'admin' }, { algorithm: 'HS512' })

      expect(await verifyRouteToken(routeRequest(token))).toBeNull()
    })

    it('accepts a valid HS256 access token', async () => {
      const token = sign({ sub: 'user-1', email: 'u@example.com', role: 'admin' })

      expect(await verifyRouteToken(routeRequest(token))).toMatchObject({ sub: 'user-1', role: 'admin' })
    })
  })
})
