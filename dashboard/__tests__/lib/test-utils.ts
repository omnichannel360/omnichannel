/**
 * Test Utilities for Rate Limiting Tests
 */

import { NextRequest } from 'next/server'

export interface MockRequestOptions {
  ip?: string
  userId?: string
  path?: string
  method?: string
  headers?: Record<string, string>
}

/**
 * Create a mock NextRequest for testing
 */
export function createMockRequest(options: MockRequestOptions = {}): NextRequest {
  const {
    ip = '192.168.1.1',
    userId,
    path = '/api/test',
    method = 'GET',
    headers = {},
  } = options

  const url = new URL(`http://localhost${path}`)
  const requestHeaders = new Headers({
    'x-forwarded-for': ip,
    ...(userId && { 'x-user-id': userId }),
    ...headers,
  })

  return new NextRequest(url, {
    method,
    headers: requestHeaders,
  })
}

/**
 * Create mock requests for concurrent testing
 */
export function createMockRequests(
  count: number,
  baseOptions: MockRequestOptions = {}
): NextRequest[] {
  return Array(count)
    .fill(null)
    .map(() => createMockRequest(baseOptions))
}

/**
 * Extract rate limit info from response headers
 */
export function getRateLimitInfo(response: Response) {
  return {
    limit: parseInt(response.headers.get('X-RateLimit-Limit') || '0'),
    remaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '0'),
    reset: parseInt(response.headers.get('X-RateLimit-Reset') || '0'),
    retryAfter: response.headers.get('Retry-After'),
  }
}

/**
 * Wait for specified milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
