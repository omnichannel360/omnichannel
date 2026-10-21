# Error Handling Route Implementation Template

This template shows the complete, production-ready pattern for implementing error handling in API routes using the enhanced error handling system (v2).

## Complete Route Implementation

```typescript
/**
 * API Route: /api/resource
 * 
 * Demonstrates comprehensive error handling:
 * - Input validation with detailed error messages
 * - Authentication and authorization
 * - Resource operations with error handling
 * - Retry logic for external services
 * - Circuit breaker for failing services
 * - Correlation ID propagation
 * - Structured logging
 */

import { NextRequest, NextResponse } from 'next/server'
import { protectRouteMulti, type RouteHandler } from '@/lib/protected-route'
import {
  extractCorrelationFromRequest,
  createSuccessResponse,
  handleRouteError,
  formatErrorLog,
  createErrorResponse,
  EXTENDED_ERROR_CODES,
  parseValidationErrors,
  retryWithBackoff,
  CircuitBreaker,
  createBulkOperationResponse,
} from '@/lib/error-handling-v2'
import { logger, createLogContext } from '@/lib/logger'
import { validateBody } from '@/lib/validation/middleware'
import { z } from 'zod'

// ============================================================================
// SCHEMAS
// ============================================================================

// Input validation schemas
const CreateResourceSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  status: z.enum(['active', 'inactive']).optional(),
})

type CreateResourceInput = z.infer<typeof CreateResourceSchema>

// Response types
interface Resource {
  id: string
  name: string
  email: string
  status: 'active' | 'inactive'
  createdAt: string
  updatedAt: string
}

// ============================================================================
// CIRCUIT BREAKER (for external service calls)
// ============================================================================

const externalServiceBreaker = new CircuitBreaker(
  5,     // Fail after 5 consecutive failures
  60000, // Reset after 60 seconds
  1      // Try 1 request in half-open state
)

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validates the request body against schema
 */
function validateResourceInput(data: unknown) {
  try {
    return { success: true, data: CreateResourceSchema.parse(data) }
  } catch (error) {
    return { success: false, error }
  }
}

/**
 * Simulates an external service call with circuit breaker
 */
async function callExternalService(resourceId: string) {
  return externalServiceBreaker.execute(async () => {
    // Simulated external API call
    const response = await fetch(`https://external-api.com/sync/${resourceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`External service error: ${response.status}`)
    }

    return response.json()
  })
}

/**
 * Creates a resource in the database
 */
async function createResourceInDatabase(data: CreateResourceInput): Promise<Resource> {
  // Simulate database operation
  const resource: Resource = {
    id: `res_${Date.now()}`,
    name: data.name,
    email: data.email,
    status: data.status || 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  // Simulate occasional database errors
  if (Math.random() < 0.05) {
    throw new Error('Database connection timeout')
  }

  return resource
}

/**
 * Retrieves a resource from the database
 */
async function getResourceFromDatabase(id: string): Promise<Resource | null> {
  // Simulate database operation
  if (id === 'invalid') {
    throw new Error('ENOENT: resource not found')
  }

  return {
    id,
    name: 'Example Resource',
    email: 'example@example.com',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Deletes a resource from the database
 */
async function deleteResourceFromDatabase(id: string): Promise<void> {
  // Simulate database operation
  if (id === 'protected') {
    throw new Error('Cannot delete protected resource')
  }

  // Success
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

const handlers: Record<string, RouteHandler> = {
  /**
   * GET /api/resource[?id=:id]
   * 
   * Retrieves a single resource or lists all resources
   * 
   * Success: 200 with resource
   * Errors:
   * - 404 RESOURCE_NOT_FOUND if resource doesn't exist
   * - 500 DATABASE_ERROR if database operation fails
   */
  GET: async (request: NextRequest, { userId }) => {
    const requestId = extractCorrelationFromRequest(request.headers)
    const startTime = Date.now()

    const logContext = createLogContext({
      method: 'GET',
      path: request.nextUrl.pathname,
      userId,
      operation: 'get_resource',
      requestId,
    })

    try {
      // Parse query parameters
      const searchParams = request.nextUrl.searchParams
      const id = searchParams.get('id')

      if (!id) {
        // List all resources
        logger.info('Listing all resources', logContext)

        const resources = [
          {
            id: 'res_1',
            name: 'Resource 1',
            email: 'res1@example.com',
            status: 'active' as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]

        const responseTime = Date.now() - startTime

        logger.info('Resources listed successfully', {
          ...logContext,
          statusCode: 200,
          responseTimeMs: responseTime,
          resourceCount: resources.length,
        })

        const response = NextResponse.json(
          createSuccessResponse(
            { resources, total: resources.length },
            requestId,
            { total: resources.length }
          ),
          { status: 200 }
        )
        response.headers.set('x-correlation-id', requestId)
        return response
      }

      // Get single resource
      logger.info('Retrieving resource', { ...logContext, resourceId: id })

      const resource = await retryWithBackoff(
        () => getResourceFromDatabase(id),
        { maxRetries: 2, delayMs: 100, backoff: 'exponential' }
      )

      if (!resource) {
        const responseTime = Date.now() - startTime

        logger.warn('Resource not found', {
          ...logContext,
          resourceId: id,
          statusCode: 404,
          responseTimeMs: responseTime,
        })

        return createErrorResponse(
          'Resource not found',
          EXTENDED_ERROR_CODES.RESOURCE_NOT_FOUND,
          requestId,
          404
        )
      }

      const responseTime = Date.now() - startTime

      logger.info('Resource retrieved successfully', {
        ...logContext,
        resourceId: id,
        statusCode: 200,
        responseTimeMs: responseTime,
      })

      const response = NextResponse.json(createSuccessResponse(resource, requestId), {
        status: 200,
      })
      response.headers.set('x-correlation-id', requestId)
      return response
    } catch (error) {
      const responseTime = Date.now() - startTime
      const { response, statusCode, code } = handleRouteError(error, requestId, {
        method: 'GET',
        path: request.nextUrl.pathname,
        userId,
        operation: 'get_resource',
      })

      logger.error('Failed to retrieve resource', error, formatErrorLog('Get resource error', error, {
        ...logContext,
        statusCode,
        responseTimeMs: responseTime,
      }))

      response.headers.set('x-correlation-id', requestId)
      return response
    }
  },

  /**
   * POST /api/resource
   * 
   * Creates a new resource
   * 
   * Body:
   * {
   *   "name": string (required, 1-100 chars)
   *   "email": string (required, valid email)
   *   "status": "active" | "inactive" (optional)
   * }
   * 
   * Success: 201 with created resource
   * Errors:
   * - 400 VALIDATION_ERROR if input is invalid
   * - 400 MISSING_REQUIRED_FIELD if required field missing
   * - 400 INVALID_FORMAT if email format invalid
   * - 500 DATABASE_ERROR if database operation fails
   * - 502 EXTERNAL_SERVICE_ERROR if external service fails
   */
  POST: async (request: NextRequest, { userId }) => {
    const requestId = extractCorrelationFromRequest(request.headers)
    const startTime = Date.now()

    const logContext = createLogContext({
      method: 'POST',
      path: request.nextUrl.pathname,
      userId,
      operation: 'create_resource',
      requestId,
    })

    try {
      // Parse and validate request body
      const body = await request.json()

      const validation = validateResourceInput(body)
      if (!validation.success) {
        const validationErrors = parseValidationErrors(validation.error)

        logger.warn('Request validation failed', {
          ...logContext,
          statusCode: 400,
          validationErrors: validationErrors.map(e => e.field),
        })

        return createErrorResponse(
          'Request validation failed',
          EXTENDED_ERROR_CODES.VALIDATION_ERROR,
          requestId,
          400,
          { validationErrors }
        )
      }

      const data = validation.data as CreateResourceInput

      logger.info('Creating resource', {
        ...logContext,
        resourceName: data.name,
        resourceEmail: data.email,
      })

      // Create resource with retry logic
      const resource = await retryWithBackoff(
        () => createResourceInDatabase(data),
        { maxRetries: 3, delayMs: 100, backoff: 'exponential' }
      )

      logger.info('Resource created', {
        ...logContext,
        resourceId: resource.id,
        statusCode: 201,
      })

      // Call external service asynchronously (don't block response)
      callExternalService(resource.id).catch(error => {
        logger.error('External service sync failed', error, formatErrorLog(
          'Failed to sync with external service',
          error,
          { ...logContext, resourceId: resource.id }
        ))
        // Don't fail the request - external service failure is non-critical
      })

      const response = NextResponse.json(createSuccessResponse(resource, requestId), {
        status: 201,
      })
      response.headers.set('x-correlation-id', requestId)
      return response
    } catch (error) {
      const responseTime = Date.now() - startTime
      const { response, statusCode } = handleRouteError(error, requestId, {
        method: 'POST',
        path: request.nextUrl.pathname,
        userId,
        operation: 'create_resource',
      })

      logger.error('Failed to create resource', error, formatErrorLog(
        'Create resource error',
        error,
        { ...logContext, statusCode, responseTimeMs: responseTime }
      ))

      response.headers.set('x-correlation-id', requestId)
      return response
    }
  },

  /**
   * DELETE /api/resource/:id
   * 
   * Deletes a resource
   * 
   * Success: 204 No Content
   * Errors:
   * - 404 RESOURCE_NOT_FOUND if resource doesn't exist
   * - 403 OPERATION_NOT_ALLOWED if resource cannot be deleted
   * - 500 DATABASE_ERROR if database operation fails
   */
  DELETE: async (request: NextRequest, { userId }) => {
    const requestId = extractCorrelationFromRequest(request.headers)
    const startTime = Date.now()

    // Extract ID from URL path
    const pathSegments = request.nextUrl.pathname.split('/')
    const id = pathSegments[pathSegments.length - 1]

    const logContext = createLogContext({
      method: 'DELETE',
      path: request.nextUrl.pathname,
      userId,
      operation: 'delete_resource',
      resourceId: id,
      requestId,
    })

    try {
      logger.info('Deleting resource', logContext)

      await deleteResourceFromDatabase(id)

      const responseTime = Date.now() - startTime

      logger.info('Resource deleted successfully', {
        ...logContext,
        statusCode: 204,
        responseTimeMs: responseTime,
      })

      const response = new NextResponse(null, { status: 204 })
      response.headers.set('x-correlation-id', requestId)
      return response
    } catch (error) {
      const responseTime = Date.now() - startTime
      const { response, statusCode } = handleRouteError(error, requestId, {
        method: 'DELETE',
        path: request.nextUrl.pathname,
        userId,
        operation: 'delete_resource',
      })

      logger.error('Failed to delete resource', error, formatErrorLog(
        'Delete resource error',
        error,
        { ...logContext, statusCode, responseTimeMs: responseTime }
      ))

      response.headers.set('x-correlation-id', requestId)
      return response
    }
  },
}

// ============================================================================
// ROUTE EXPORT
// ============================================================================

export const { GET, POST, PUT, PATCH, DELETE } = protectRouteMulti(handlers as any)
```

## Key Patterns Demonstrated

### 1. **Input Validation with Detailed Errors**
- Uses Zod for schema validation
- Parses validation errors for detailed client feedback
- Returns 400 with `VALIDATION_ERROR` code

### 2. **Error Classification**
- Maps different error types to specific error codes
- Handles database errors, file system errors, timeouts separately
- Provides appropriate HTTP status codes

### 3. **Retry Logic**
- Automatic retry for transient failures
- Exponential backoff to prevent thundering herd
- Configurable max retries

### 4. **Circuit Breaker**
- Protects against cascading failures
- External service calls wrapped with breaker
- Prevents repeated requests to failing services

### 5. **Correlation ID Propagation**
- Extracted from request headers
- Included in all responses
- Used in structured logging for tracing

### 6. **Structured Logging**
- Request start/end logging
- Error context including status codes and timings
- Separate logging for user-facing vs internal errors

### 7. **Response Formatting**
- Consistent success/error response envelopes
- Includes request ID and timestamp
- Validation error details in response

## Usage Examples

### Creating a Resource
```bash
curl -X POST http://localhost:3000/api/resource \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"My Resource","email":"test@example.com"}'
```

Response (success):
```json
{
  "success": true,
  "data": {
    "id": "res_1698765432000",
    "name": "My Resource",
    "email": "test@example.com",
    "status": "active",
    "createdAt": "2024-10-22T12:00:00.000Z",
    "updatedAt": "2024-10-22T12:00:00.000Z"
  },
  "requestId": "1698765432000-a1b2c3d4",
  "timestamp": "2024-10-22T12:00:00.000Z"
}
```

### Validation Error
```bash
curl -X POST http://localhost:3000/api/resource \
  -H "Content-Type: application/json" \
  -d '{"name":"","email":"invalid-email"}'
```

Response (error):
```json
{
  "success": false,
  "error": "Request validation failed",
  "code": "VALIDATION_ERROR",
  "requestId": "1698765432000-a1b2c3d4",
  "timestamp": "2024-10-22T12:00:00.000Z",
  "validationErrors": [
    {
      "field": "name",
      "message": "String must contain at least 1 character(s)",
      "constraint": "too_small"
    },
    {
      "field": "email",
      "message": "Invalid email",
      "constraint": "invalid_string"
    }
  ]
}
```

### Not Found Error
```bash
curl http://localhost:3000/api/resource?id=nonexistent \
  -H "Authorization: Bearer $TOKEN"
```

Response (error):
```json
{
  "success": false,
  "error": "Resource not found",
  "code": "RESOURCE_NOT_FOUND",
  "requestId": "1698765432000-a1b2c3d4",
  "timestamp": "2024-10-22T12:00:00.000Z"
}
```

HTTP: 404

### Server Error with Retry
If the service experiences a transient error, the system automatically retries with exponential backoff. After max retries, it returns:

```json
{
  "success": false,
  "error": "Database operation failed",
  "code": "DATABASE_ERROR",
  "requestId": "1698765432000-a1b2c3d4",
  "timestamp": "2024-10-22T12:00:00.000Z",
  "retryable": true,
  "retryAfterSeconds": 3
}
```

HTTP: 500 with `Retry-After: 3` header

## Testing This Route

See `error-handling-v2.test.ts` for comprehensive test examples covering:
- All HTTP status codes
- Validation scenarios
- Retry behavior
- Circuit breaker state transitions
- Correlation ID propagation
- Error context enrichment

