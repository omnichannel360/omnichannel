/**
 * TEMPLATE: API Route Error Handling Pattern
 *
 * Copy this template and adapt for each route.
 * All error handling must follow this structure.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createLogger, createLogContext } from '@/lib/logger'
import {
  getOrCreateCorrelationId,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  getSafeErrorMessage,
  formatErrorLog,
  getHttpStatus,
} from '@/lib/error-handling'

// ============================================================================
// STEP 1: Create module-specific logger
// ============================================================================
const logger = createLogger('module-name')

// ============================================================================
// STEP 2: Define types for request/response
// ============================================================================
interface RequestPayload {
  // Define your request fields
}

interface ResponsePayload {
  // Define your response fields
}

// ============================================================================
// STEP 3: Implement handler with proper error handling
// ============================================================================
export async function GET(request: NextRequest) {
  // ─────────────────────────────────────────────────────────────────────────
  // SETUP: Create correlation ID and log context
  // ─────────────────────────────────────────────────────────────────────────
  const correlationId = getOrCreateCorrelationId(
    request.headers.get('x-correlation-id')
  )

  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    correlationId,
    userId: request.headers.get('x-user-id') || undefined,
  })

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Validate Input
    // ─────────────────────────────────────────────────────────────────────────

    // Extract and validate query parameters
    const { searchParams } = request.nextUrl
    const page = searchParams.get('page')
    const limit = searchParams.get('limit')

    // Validate page parameter
    if (page !== null && (isNaN(Number(page)) || Number(page) < 1)) {
      return createErrorResponse(
        'Page must be a positive number',
        ERROR_CODES.INVALID_INPUT,
        correlationId,
        400,
        { field: 'page' }
      )
    }

    // Validate limit parameter
    if (limit !== null && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
      return createErrorResponse(
        'Limit must be between 1 and 100',
        ERROR_CODES.INVALID_INPUT,
        correlationId,
        400,
        { field: 'limit', constraint: '1-100' }
      )
    }

    const pageNum = page ? Number(page) : 1
    const limitNum = limit ? Number(limit) : 10

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Perform Business Logic
    // ─────────────────────────────────────────────────────────────────────────

    // Simulated data fetch
    const data: ResponsePayload[] = []
    // ... your business logic here

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Return Success
    // ─────────────────────────────────────────────────────────────────────────

    const response = createSuccessResponse(data, correlationId)

    logger.info('Operation successful', {
      ...logContext,
      recordCount: data.length,
    })

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    // ─────────────────────────────────────────────────────────────────────────
    // ERROR HANDLING: Categorize and respond appropriately
    // ─────────────────────────────────────────────────────────────────────────

    // Determine error type and appropriate response
    let errorCode = ERROR_CODES.INTERNAL_ERROR
    let statusCode = 500
    let errorMessage = 'An unexpected error occurred'

    if (error instanceof ValidationError) {
      errorCode = ERROR_CODES.VALIDATION_ERROR
      statusCode = 400
      errorMessage = 'Request validation failed'
    } else if (error instanceof NotFoundError) {
      errorCode = ERROR_CODES.RESOURCE_NOT_FOUND
      statusCode = 404
      errorMessage = 'Resource not found'
    } else if (error instanceof ConflictError) {
      errorCode = ERROR_CODES.CONFLICT
      statusCode = 409
      errorMessage = 'Resource already exists'
    } else if (error instanceof PermissionError) {
      errorCode = ERROR_CODES.INSUFFICIENT_PERMISSIONS
      statusCode = 403
      errorMessage = 'Insufficient permissions'
    }

    // Log the error with full context
    logger.error(
      errorMessage,
      formatErrorLog(errorMessage, error, {
        ...logContext,
        statusCode,
        errorCode,
      })
    )

    // Return formatted error response
    return createErrorResponse(
      getSafeErrorMessage(error, errorMessage),
      errorCode,
      correlationId,
      statusCode
    )
  }
}

// ============================================================================
// STEP 4: Handle POST, PUT, DELETE similarly
// ============================================================================

export async function POST(request: NextRequest) {
  const correlationId = getOrCreateCorrelationId(
    request.headers.get('x-correlation-id')
  )

  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    correlationId,
    userId: request.headers.get('x-user-id') || undefined,
  })

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATE: Parse and validate request body
    // ─────────────────────────────────────────────────────────────────────────

    let payload: RequestPayload
    try {
      payload = await request.json()
    } catch (error) {
      return createErrorResponse(
        'Invalid JSON in request body',
        ERROR_CODES.INVALID_INPUT,
        correlationId,
        400
      )
    }

    // Validate required fields
    if (!payload || typeof payload !== 'object') {
      return createErrorResponse(
        'Request body must be a valid JSON object',
        ERROR_CODES.INVALID_INPUT,
        correlationId,
        400
      )
    }

    // Validate schema (use Zod or similar)
    // const validation = MySchema.safeParse(payload)
    // if (!validation.success) {
    //   return createErrorResponse(
    //     validation.error.errors[0].message,
    //     ERROR_CODES.VALIDATION_ERROR,
    //     correlationId,
    //     400,
    //     { field: validation.error.errors[0].path.join('.') }
    //   )
    // }

    // ─────────────────────────────────────────────────────────────────────────
    // PROCESS: Execute business logic
    // ─────────────────────────────────────────────────────────────────────────

    const result = await processRequest(payload)

    // ─────────────────────────────────────────────────────────────────────────
    // RESPOND: Return success
    // ─────────────────────────────────────────────────────────────────────────

    const response = createSuccessResponse(result, correlationId)

    logger.info('POST operation successful', {
      ...logContext,
      resultId: (result as any)?.id,
    })

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    let errorCode = ERROR_CODES.INTERNAL_ERROR
    let statusCode = 500
    let errorMessage = 'Failed to create resource'

    if (error instanceof ValidationError) {
      errorCode = ERROR_CODES.VALIDATION_ERROR
      statusCode = 400
      errorMessage = 'Validation failed'
    } else if (error instanceof ConflictError) {
      errorCode = ERROR_CODES.CONFLICT
      statusCode = 409
      errorMessage = 'Resource already exists'
    }

    logger.error(
      errorMessage,
      formatErrorLog(errorMessage, error, {
        ...logContext,
        statusCode,
        errorCode,
      })
    )

    return createErrorResponse(
      getSafeErrorMessage(error, errorMessage),
      errorCode,
      correlationId,
      statusCode
    )
  }
}

// ============================================================================
// STEP 5: Define custom error classes (optional but recommended)
// ============================================================================

class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

class PermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
}

// ============================================================================
// STEP 6: Define business logic function (example)
// ============================================================================

async function processRequest(payload: RequestPayload): Promise<ResponsePayload> {
  // Implement your business logic here
  // Throw custom errors as needed:
  //   throw new ValidationError('...')
  //   throw new NotFoundError('...')
  //   throw new ConflictError('...')

  return {} as ResponsePayload
}

// ============================================================================
// CHECKLIST FOR IMPLEMENTATION
// ============================================================================

/*
Before marking complete:

REQUIRED:
- [ ] Create logger for module
- [ ] Extract/create correlation ID in all handlers
- [ ] Create log context with method, path, userId
- [ ] Validate ALL inputs (query, body, headers)
- [ ] Wrap business logic in try-catch
- [ ] Handle each error type specifically
- [ ] Return formatted error responses (not plain strings)
- [ ] Log errors with formatErrorLog()
- [ ] Use getSafeErrorMessage() for production safety
- [ ] Return success responses with createSuccessResponse()

TESTING:
- [ ] Test valid request → 200 OK
- [ ] Test missing required field → 400
- [ ] Test invalid field type → 400
- [ ] Test unauthorized → 401
- [ ] Test forbidden → 403
- [ ] Test not found → 404
- [ ] Test conflict → 409
- [ ] Test rate limit → 429
- [ ] Test internal error → 500
- [ ] Test service unavailable → 503

SECURITY:
- [ ] No stack traces in responses
- [ ] No file paths exposed
- [ ] No database details exposed
- [ ] No API keys/secrets in errors
- [ ] Correlation ID for tracing
- [ ] Timestamp for debugging

DOCUMENTATION:
- [ ] JSDoc comments for handlers
- [ ] Error scenarios documented
- [ ] Expected status codes listed
- [ ] Example requests/responses included

*/
