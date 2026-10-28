/**
 * Auth Testing Helpers & Utilities
 * Reusable fixtures, factories, and assertion utilities
 */

import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { TokenPayload } from '@/lib/auth'

// ============================================================================
// CONFIGURATION
// ============================================================================

export const TEST_JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-12345'
export const TEST_NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-nextauth-secret'

// ============================================================================
// TEST USER FIXTURES
// ============================================================================

export interface TestUser {
  id: string
  email: string
  role: 'admin' | 'user' | 'viewer'
}

export const TEST_USERS = {
  admin: {
    id: 'admin-001',
    email: 'admin@example.com',
    role: 'admin' as const,
  },
  user: {
    id: 'user-001',
    email: 'user@example.com',
    role: 'user' as const,
  },
  viewer: {
    id: 'viewer-001',
    email: 'viewer@example.com',
    role: 'viewer' as const,
  },
  service: {
    id: 'service-001',
    email: 'service@omnichannelsol.com',
    role: 'user' as const,
  },
}

// ============================================================================
// TOKEN FACTORY
// ============================================================================

export interface TokenOptions {
  sub?: string
  email?: string
  role?: 'admin' | 'user' | 'viewer'
  iat?: number
  exp?: number
  jti?: string // JWT ID for tracking
  aud?: string // Audience
  iss?: string // Issuer
}

/**
 * Factory function to create test JWT tokens
 */
export function createToken(user: TestUser, options: TokenOptions = {}): string {
  const now = Math.floor(Date.now() / 1000)

  const payload: TokenPayload & Record<string, any> = {
    sub: options.sub ?? user.id,
    email: options.email ?? user.email,
    role: options.role ?? user.role,
    iat: options.iat ?? now,
    exp: options.exp ?? now + 3600,
    ...(options.jti && { jti: options.jti }),
    ...(options.aud && { aud: options.aud }),
    ...(options.iss && { iss: options.iss }),
  }

  return jwt.sign(payload, TEST_JWT_SECRET)
}

/**
 * Create a token for a specific user
 */
export function createAdminToken(options: TokenOptions = {}): string {
  return createToken(TEST_USERS.admin, options)
}

export function createUserToken(options: TokenOptions = {}): string {
  return createToken(TEST_USERS.user, options)
}

export function createViewerToken(options: TokenOptions = {}): string {
  return createToken(TEST_USERS.viewer, options)
}

/**
 * Create an expired token
 */
export function createExpiredToken(user: TestUser = TEST_USERS.user): string {
  const now = Math.floor(Date.now() / 1000)
  return createToken(user, {
    iat: now - 7200, // 2 hours ago
    exp: now - 3600, // Expired 1 hour ago
  })
}

/**
 * Create a token with future expiration
 */
export function createTokenWithExpiry(
  user: TestUser = TEST_USERS.user,
  expiresInSeconds: number
): string {
  const now = Math.floor(Date.now() / 1000)
  return createToken(user, {
    exp: now + expiresInSeconds,
  })
}

// ============================================================================
// REQUEST FACTORY
// ============================================================================

export interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: Record<string, any>
  query?: Record<string, string>
}

/**
 * Create a NextRequest with authorization header
 */
export function createRequest(
  token: string | null,
  path: string = '/api/test',
  options: RequestOptions = {}
): NextRequest {
  const { method = 'GET', headers: customHeaders = {}, body } = options

  const headers = new Headers(customHeaders)

  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }

  headers.set('content-type', 'application/json')

  let url = new URL(`http://localhost:3000${path}`)

  const requestInit: RequestInit & { headers: Headers } = {
    method,
    headers,
  }

  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    requestInit.body = JSON.stringify(body)
  }

  return new NextRequest(url, requestInit)
}

/**
 * Create an authenticated request
 */
export function createAuthenticatedRequest(
  user: TestUser = TEST_USERS.user,
  path: string = '/api/test',
  options: RequestOptions = {}
): NextRequest {
  const token = createToken(user)
  return createRequest(token, path, options)
}

/**
 * Create an unauthenticated request
 */
export function createUnauthenticatedRequest(
  path: string = '/api/test',
  options: RequestOptions = {}
): NextRequest {
  return createRequest(null, path, options)
}

/**
 * Create a request with specific authorization header format
 */
export function createRequestWithAuthHeader(
  authHeader: string,
  path: string = '/api/test'
): NextRequest {
  const headers = new Headers()
  headers.set('authorization', authHeader)
  return new NextRequest(new URL(`http://localhost:3000${path}`), {
    method: 'GET',
    headers,
  })
}

// ============================================================================
// RESPONSE ASSERTIONS
// ============================================================================

/**
 * Assert successful authentication response
 */
export async function assertAuthSuccess(response: NextResponse) {
  expect(response).toBeDefined()
  expect(response.status).toBe(200)

  const body = await response.json()
  expect(body.success).toBe(true)
  expect(body.data).toBeDefined()
}

/**
 * Assert 401 Unauthorized response
 */
export async function assertUnauthorized(response: NextResponse) {
  expect(response.status).toBe(401)

  const body = await response.json()
  expect(body.success).toBe(false)
  expect(body.error).toBeDefined()
}

/**
 * Assert 403 Forbidden response
 */
export async function assertForbidden(response: NextResponse) {
  expect(response.status).toBe(403)

  const body = await response.json()
  expect(body.success).toBe(false)
  expect(body.error).toBeDefined()
}

// ============================================================================
// TEST CONTEXT BUILDERS
// ============================================================================

/**
 * Build a minimal auth context for testing
 */
export function buildAuthContext(user: TestUser = TEST_USERS.user) {
  return {
    authenticated: true,
    payload: {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    userId: user.id,
    email: user.email,
    role: user.role,
    error: undefined,
  }
}

/**
 * Build an unauthorized auth context
 */
export function buildUnauthorizedContext(error: string = 'Missing token') {
  return {
    authenticated: false,
    error,
    payload: undefined,
  }
}

// ============================================================================
// MOCK BUILDERS
// ============================================================================

/**
 * Create a mock auth service
 */
export function createMockAuthService() {
  return {
    verifyToken: jest.fn().mockResolvedValue({ sub: 'user-123', email: 'test@example.com' }),
    generateToken: jest.fn().mockReturnValue(createUserToken()),
    refreshToken: jest.fn().mockResolvedValue(createUserToken()),
    revokeToken: jest.fn().mockResolvedValue(true),
    validateCredentials: jest.fn().mockResolvedValue(true),
  }
}

/**
 * Create a mock Supabase auth service
 */
export function createMockSupabaseAuth() {
  return {
    getUserById: jest.fn().mockResolvedValue({ id: 'user-123', email: 'test@example.com' }),
    getUserByEmail: jest.fn().mockResolvedValue({ id: 'user-123', email: 'test@example.com' }),
    createUser: jest.fn().mockResolvedValue({ id: 'user-456' }),
    updateUser: jest.fn().mockResolvedValue({ id: 'user-123' }),
    deleteUser: jest.fn().mockResolvedValue(true),
  }
}

// ============================================================================
// PARAMETERIZED TEST HELPERS
// ============================================================================

/**
 * Generate test cases for all user roles
 */
export function generateRoleTestCases() {
  return [
    { user: TEST_USERS.admin, role: 'admin' },
    { user: TEST_USERS.user, role: 'user' },
    { user: TEST_USERS.viewer, role: 'viewer' },
  ]
}

/**
 * Generate test cases for invalid tokens
 */
export function generateInvalidTokenCases() {
  return [
    { token: 'invalid', description: 'plain string' },
    { token: 'not.a.token', description: 'two parts only' },
    { token: '!!!.!!!.!!!', description: 'invalid base64' },
    { token: 'Bearer token123', description: 'malformed format' },
    { token: '', description: 'empty string' },
  ]
}

/**
 * Generate test cases for special characters
 */
export function generateSpecialCharacterCases() {
  return [
    { value: 'test+tag@example.com', description: 'plus sign in email' },
    { value: 'test.name@sub.example.co.uk', description: 'multiple dots in email' },
    { value: 'test_user-name@example.com', description: 'underscore and hyphen' },
    { value: 'user@127.0.0.1', description: 'IP address' },
    { value: 'user@[::1]', description: 'IPv6 address' },
  ]
}

// ============================================================================
// CLEANUP & RESET
// ============================================================================

/**
 * Clear all mocks and restore defaults
 */
export function resetAuthMocks() {
  jest.clearAllMocks()
  jest.resetAllMocks()
}

/**
 * Setup test environment
 */
export function setupAuthTestEnvironment() {
  beforeEach(() => {
    // Reset time mocks
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-01-15T12:00:00Z'))
  })

  afterEach(() => {
    resetAuthMocks()
    jest.useRealTimers()
  })
}

// ============================================================================
// PERFORMANCE TEST HELPERS
// ============================================================================

/**
 * Measure token generation performance
 */
export async function measureTokenGeneration(count: number = 1000): Promise<number> {
  const start = performance.now()

  for (let i = 0; i < count; i++) {
    createUserToken()
  }

  return performance.now() - start
}

/**
 * Measure auth context creation performance
 */
export async function measureAuthContextCreation(
  count: number = 1000
): Promise<number> {
  const start = performance.now()

  for (let i = 0; i < count; i++) {
    buildAuthContext()
  }

  return performance.now() - start
}

// ============================================================================
// BATCH TEST EXECUTION
// ============================================================================

/**
 * Run a test across multiple users
 */
export async function testAcrossUsers(
  testFn: (user: TestUser) => Promise<void> | void
): Promise<void> {
  for (const user of Object.values(TEST_USERS)) {
    await testFn(user)
  }
}

/**
 * Run a test across multiple roles
 */
export async function testAcrossRoles(
  testFn: (role: 'admin' | 'user' | 'viewer') => Promise<void> | void
): Promise<void> {
  const roles: Array<'admin' | 'user' | 'viewer'> = ['admin', 'user', 'viewer']

  for (const role of roles) {
    await testFn(role)
  }
}
