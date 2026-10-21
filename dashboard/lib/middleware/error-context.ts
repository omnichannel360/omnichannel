/**
 * Request Context Middleware
 * Adds correlation IDs and request context to all requests
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger, createLogContext, LogContext } from '@/lib/logger'

// Store context in request headers for access in route handlers
const CORRELATION_ID_HEADER = 'x-correlation-id'
const REQUEST_START_TIME_HEADER = 'x-request-start-time'

/**
 * Generate or extract correlation ID from request
 * Uses cryptographically secure random generation
 */
export function getOrCreateCorrelationId(request: NextRequest): string {
  const existing = request.headers.get(CORRELATION_ID_HEADER)
  if (existing) {
    return existing
  }

  // Use crypto.getRandomValues for secure random bytes, fallback to timestamp
  const randomPart = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('')
    : Math.random().toString(36).substring(2, 11)

  return `req-${Date.now()}-${randomPart}`
}

/**
 * Extract context from request
 */
export function extractRequestContext(request: NextRequest): LogContext {
  const correlationId = getOrCreateCorrelationId(request)
  const startTimeHeader = request.headers.get(REQUEST_START_TIME_HEADER)
  const startTime = startTimeHeader ? parseInt(startTimeHeader, 10) : Date.now()

  return {
    correlationId,
    requestId: correlationId,
    route: request.nextUrl.pathname,
    method: request.method,
    duration: Date.now() - startTime
  }
}

/**
 * Middleware to add request context to all responses
 */
export async function errorContextMiddleware(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  const correlationId = getOrCreateCorrelationId(request)
  const startTime = Date.now()

  try {
    // Clone headers to add correlation ID
    const headers = new Headers(request.headers)
    headers.set(CORRELATION_ID_HEADER, correlationId)
    headers.set(REQUEST_START_TIME_HEADER, startTime.toString())

    // Create a new request with updated headers
    const newRequest = new NextRequest(request, { headers })

    // Execute the handler
    const response = await handler(newRequest)

    // Add correlation ID to response headers
    const duration = Date.now() - startTime
    const newResponse = new NextResponse(response.body, response)
    newResponse.headers.set(CORRELATION_ID_HEADER, correlationId)
    newResponse.headers.set('x-response-time', `${duration}ms`)

    logger.debug('Request completed', {
      correlationId,
      route: request.nextUrl.pathname,
      method: request.method,
      duration,
      status: response.status
    })

    return newResponse
  } catch (error) {
    const duration = Date.now() - startTime

    logger.error(
      'Request handler error',
      error,
      {
        correlationId,
        route: request.nextUrl.pathname,
        method: request.method,
        duration
      }
    )

    // Return error response with correlation ID
    const response = NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        correlationId
      },
      { status: 500 }
    )

    response.headers.set(CORRELATION_ID_HEADER, correlationId)
    response.headers.set('x-response-time', `${duration}ms`)

    return response
  }
}

/**
 * Add context to request for use in handlers
 */
export function attachRequestContext(
  request: NextRequest,
  context: LogContext
): NextRequest {
  const headers = new Headers(request.headers)

  if (context.correlationId) {
    headers.set(CORRELATION_ID_HEADER, context.correlationId)
  }

  return new NextRequest(request, { headers })
}

/**
 * Helper to get correlation ID from request headers
 */
export function getCorrelationIdFromHeaders(headers: Headers): string {
  return headers.get(CORRELATION_ID_HEADER) || 'unknown'
}
