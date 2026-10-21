/**
 * API Error Handler Wrapper
 * Simplifies error handling for API routes by providing a consistent wrapper
 * for common try-catch patterns with logging and correlation IDs.
 *
 * Key Features:
 * - Automatic correlation ID propagation
 * - Structured error response formatting
 * - Safe error message masking (dev vs prod)
 * - Consistent HTTP status codes
 * - Request/response timing
 * - Context-aware error logging
 */

import { NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'
import {
  extractCorrelationFromRequest,
  handleRouteError,
  formatErrorLog,
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
  type ErrorCode,
} from '@/lib/error-handling'

const logger = createLogger('api-error-handler')

export interface ApiHandlerOptions {
  method: string
  path: string
  operation: string
  userId?: string
  logDetails?: boolean
}

export interface ApiHandlerResult<T> {
  success: true
  data?: T
  requestId: string
  timestamp: string
}

/**
 * Wraps an API handler with centralized error handling
 * Handles correlation ID extraction, error formatting, and logging
 */
export async function withErrorHandler<T>(
  handler: (requestId: string, startTime: number) => Promise<T>,
  request: NextRequest,
  options: ApiHandlerOptions
): Promise<NextResponse> {
  const requestId = extractCorrelationFromRequest(request.headers)
  const startTime = Date.now()

  try {
    const data = await handler(requestId, startTime)
    const responseTime = Date.now() - startTime

    logger.info(`${options.operation} completed successfully`, {
      requestId,
      method: options.method,
      path: options.path,
      userId: options.userId,
      operation: options.operation,
      statusCode: 200,
      responseTimeMs: responseTime,
    })

    const response = NextResponse.json(createSuccessResponse(data, requestId))
    response.headers.set('x-correlation-id', requestId)
    return response
  } catch (error) {
    const responseTime = Date.now() - startTime
    const { response, statusCode } = handleRouteError(error, requestId, {
      method: options.method,
      path: options.path,
      userId: options.userId,
      operation: options.operation,
    })

    logger.error(`${options.operation} failed`, error, formatErrorLog(
      `${options.operation} error`,
      error,
      {
        requestId,
        method: options.method,
        path: options.path,
        userId: options.userId,
        operation: options.operation,
        statusCode,
        responseTimeMs: responseTime,
      }
    ))

    response.headers.set('x-correlation-id', requestId)
    return response
  }
}

/**
 * Wraps GET request handler
 */
export async function withGetHandler<T>(
  handler: (requestId: string) => Promise<T>,
  request: NextRequest,
  options: Omit<ApiHandlerOptions, 'method'>
): Promise<NextResponse> {
  return withErrorHandler(
    (requestId) => handler(requestId),
    request,
    { ...options, method: 'GET' }
  )
}

/**
 * Wraps POST request handler
 */
export async function withPostHandler<T>(
  handler: (requestId: string) => Promise<T>,
  request: NextRequest,
  options: Omit<ApiHandlerOptions, 'method'>
): Promise<NextResponse> {
  return withErrorHandler(
    (requestId) => handler(requestId),
    request,
    { ...options, method: 'POST' }
  )
}

/**
 * Wraps PUT request handler
 */
export async function withPutHandler<T>(
  handler: (requestId: string) => Promise<T>,
  request: NextRequest,
  options: Omit<ApiHandlerOptions, 'method'>
): Promise<NextResponse> {
  return withErrorHandler(
    (requestId) => handler(requestId),
    request,
    { ...options, method: 'PUT' }
  )
}

/**
 * Wraps PATCH request handler
 */
export async function withPatchHandler<T>(
  handler: (requestId: string) => Promise<T>,
  request: NextRequest,
  options: Omit<ApiHandlerOptions, 'method'>
): Promise<NextResponse> {
  return withErrorHandler(
    (requestId) => handler(requestId),
    request,
    { ...options, method: 'PATCH' }
  )
}

/**
 * Wraps DELETE request handler
 */
export async function withDeleteHandler<T>(
  handler: (requestId: string) => Promise<T>,
  request: NextRequest,
  options: Omit<ApiHandlerOptions, 'method'>
): Promise<NextResponse> {
  return withErrorHandler(
    (requestId) => handler(requestId),
    request,
    { ...options, method: 'DELETE' }
  )
}

/**
 * Creates a structured error response with correlation ID
 * Used within handlers for specific error scenarios
 */
export function respondWithError(
  message: string,
  code: ErrorCode,
  statusCode: number,
  requestId: string,
  details?: Record<string, unknown>
): NextResponse {
  const response = createErrorResponse(message, code, requestId, statusCode, details)
  response.headers.set('x-correlation-id', requestId)
  return response
}

/**
 * Creates a structured success response with correlation ID
 * Used within handlers for successful operations
 */
export function respondWithSuccess<T>(
  data: T | undefined,
  requestId: string
): NextResponse {
  const response = NextResponse.json(createSuccessResponse(data, requestId))
  response.headers.set('x-correlation-id', requestId)
  return response
}
