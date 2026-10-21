# Comprehensive Error Handling Implementation Guide

## Overview

This guide provides a complete framework for implementing consistent, production-grade error handling across all API endpoints. The system includes:

- **Unified error response format** - All errors follow the same envelope structure
- **Correlation ID propagation** - Track requests across distributed systems
- **Structured logging** - Full context for debugging and monitoring
- **Production-safe error messages** - No sensitive data exposure
- **HTTP status code standardization** - Correct codes for all scenarios
- **Route guard pattern** - Reusable middleware for all endpoints

---

## 1. Error Response Format

All error responses follow this standard envelope:

```typescript
interface ErrorResponse {
  success: false
  error: string                    // User-friendly error message
  code: string                     // Machine-readable error code
  requestId: string               // Correlation ID for tracing
  timestamp: string               // ISO 8601 timestamp
  details?: Record<string, unknown> // Optional context details
}
```

### Example Error Response

```json
{
  "success": false,
  "error": "Request validation failed",
  "code": "VALIDATION_ERROR",
  "requestId": "1698765432000-a1b2c3d4",
  "timestamp": "2024-10-22T10:30:45.123Z",
  "details": {
    "message": "Email field is required"
  }
}
```

---

## 2. Error Codes Reference

| Code | HTTP Status | Usage |
|------|-------------|-------|
| `AUTH_MISSING` | 401 | No authentication provided |
| `AUTH_INVALID` | 401 | Invalid or expired token |
| `AUTH_EXPIRED` | 401 | Token has expired |
| `INSUFFICIENT_PERMISSIONS` | 403 | User lacks required role |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `INVALID_INPUT` | 400 | Malformed request body |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `RESOURCE_NOT_FOUND` | 404 | Resource doesn't exist |
| `NOT_FOUND` | 404 | Endpoint not found |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily down |

---

## 3. Implementing the Route Guard Pattern

The `guardRoute` wrapper handles all cross-cutting concerns automatically:

### Basic Usage (Public Route)

```typescript
import { guardPublicRoute } from '@/lib/route-handler-guard'
import { NextRequest, NextResponse } from 'next/server'

export const GET = guardPublicRoute(async (request, context) => {
  // Handler code here
  // context.requestId - Correlation ID
  // context.startTime - Request start time
  // context.logContext - Pre-built logging context
  
  return NextResponse.json({
    success: true,
    data: { /* response data */ }
  })
}, {
  operation: 'get_health_status',
  rateLimit: 'health'
})
```

### Protected Route with Auth

```typescript
import { guardRoute } from '@/lib/route-handler-guard'

export const GET = guardRoute(async (request, context) => {
  // context.userId - Authenticated user ID
  // context.payload - JWT payload
  
  return NextResponse.json({
    success: true,
    data: { /* user-specific data */ }
  })
}, {
  requireAuth: true,
  operation: 'get_user_profile',
  rateLimit: 'api'
})
```

### Admin-Only Route

```typescript
import { guardAdminRoute } from '@/lib/route-handler-guard'

export const DELETE = guardAdminRoute(async (request, context) => {
  // Only accessible to admin users
  return NextResponse.json({
    success: true,
    data: { /* admin action result */ }
  })
}, {
  operation: 'delete_user',
  rateLimit: 'admin'
})
```

---

## 4. Manual Error Handling (When Not Using Guard)

If you need to handle errors manually:

```typescript
import {
  extractCorrelationFromRequest,
  createErrorResponse,
  handleRouteError,
  getHttpStatus,
  ERROR_CODES
} from '@/lib/error-handling'

export async function GET(request: NextRequest) {
  const requestId = extractCorrelationFromRequest(request.headers)
  
  try {
    // Your logic here
    if (!resource) {
      return createErrorResponse(
        'Resource not found',
        ERROR_CODES.RESOURCE_NOT_FOUND,
        requestId,
        404
      )
    }
    
    return NextResponse.json({ success: true, data: resource })
  } catch (error) {
    // Automatic error classification and response
    const { response } = handleRouteError(error, requestId, {
      method: request.method,
      path: request.nextUrl.pathname,
      operation: 'get_resource'
    })
    return response
  }
}
```

---

## 5. Logging Context

Always include the logging context in every log call:

```typescript
const logContext = {
  requestId: context.requestId,
  userId: context.userId,
  method: request.method,
  path: request.nextUrl.pathname,
  operation: 'specific_operation'
}

logger.info('Operation completed', {
  ...logContext,
  statusCode: 200,
  responseTimeMs: Date.now() - context.startTime
})
```

---

## 6. Async Error Handling Pattern

For operations that can throw errors:

```typescript
async function riskyOperation(id: string): Promise<Data> {
  try {
    // Operation code
    if (!exists) {
      throw new Error('ENOENT: Resource not found')
    }
    return data
  } catch (error) {
    logger.error('Operation failed', error, {
      requestId,
      operation: 'risky_operation',
      inputId: id
    })
    throw error // Re-throw for route handler to catch
  }
}
```

---

## 7. Production-Safe Error Messages

**RULE: Never expose internal error details to clients**

```typescript
// WRONG - Exposes database connection string
if (error.message.includes('mongodb://')) {
  return createErrorResponse(error.message, ...)
}

// CORRECT - Safe fallback message
const safeMessage = getSafeErrorMessage(
  error,
  'Database operation failed'
)
return createErrorResponse(safeMessage, ...)
```

**Safe message patterns:**
- ✅ Validation errors (always safe)
- ✅ 404 Not Found (generic is safe)
- ✅ 403 Forbidden (safe)
- ❌ Database details (never expose)
- ❌ File paths (never expose)
- ❌ Configuration values (never expose)

---

## 8. Validation Error Details

Always include validation error details in the response:

```typescript
const validation = schema.safeParse(data)
if (!validation.success) {
  const errorDetails = {
    fields: validation.error.flatten().fieldErrors
  }
  
  return createErrorResponse(
    'Request validation failed',
    ERROR_CODES.VALIDATION_ERROR,
    requestId,
    400,
    errorDetails
  )
}
```

---

## 9. Correlation ID Propagation

Correlation IDs enable request tracing across services:

```typescript
// Extract from incoming request
const requestId = extractCorrelationFromRequest(request.headers)

// Include in all responses
return NextResponse.json(
  { /* response */ },
  {
    headers: {
      'X-Request-ID': requestId
    }
  }
)

// Pass to downstream services
const result = await fetch('https://downstream-service/api', {
  headers: {
    'X-Correlation-ID': requestId
  }
})
```

---

## 10. Testing Error Scenarios

All error paths must be tested:

```typescript
describe('API Error Handling', () => {
  it('returns 400 for invalid input', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/test', {
        method: 'GET'
      })
    )

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.code).toBe('VALIDATION_ERROR')
    expect(json.requestId).toBeTruthy()
  })

  it('returns 401 when auth is missing', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/protected')
    )

    expect(response.status).toBe(401)
    const json = await response.json()
    expect(json.code).toBe('AUTH_INVALID')
  })

  it('includes correlation ID in error response', async () => {
    const request = new NextRequest('http://localhost/api/test')
    request.headers.set('x-correlation-id', 'test-123')

    const response = await GET(request)
    const json = await response.json()
    expect(json.requestId).toBe('test-123')
  })
})
```

---

## 11. Refactoring Checklist

When updating an API endpoint:

- [ ] Use `guardRoute` or `guardPublicRoute` wrapper
- [ ] Extract and propagate correlation ID
- [ ] Include logging context in all logs
- [ ] Return structured error responses
- [ ] Use appropriate HTTP status codes
- [ ] Never expose sensitive data in error messages
- [ ] Include request ID in error details
- [ ] Write tests for all error paths
- [ ] Validate error response against schema
- [ ] Ensure 80%+ test coverage

---

## 12. Common Patterns

### Pattern: Graceful Degradation

```typescript
async function getStats() {
  try {
    return await loadStats()
  } catch (error) {
    logger.warn('Failed to load stats, returning empty', {
      requestId,
      error: error.message
    })
    return { count: 0, items: [] } // Safe default
  }
}
```

### Pattern: Validation Wrapper

```typescript
async function validateAndProcess(data: unknown) {
  const validation = schema.safeParse(data)
  if (!validation.success) {
    throw new Error(
      `validation failed: ${validation.error.message}`
    )
  }
  
  return processValidated(validation.data)
}
```

### Pattern: Operation Timeout

```typescript
const timeout = 30000
const operationWithTimeout = Promise.race([
  riskyOperation(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), timeout)
  )
])
```

---

## 13. Monitoring & Observability

All errors are logged with full context for monitoring:

```
{
  "timestamp": "2024-10-22T10:30:45.123Z",
  "level": "error",
  "message": "Request failed",
  "requestId": "1698765432000-a1b2c3d4",
  "userId": "user-123",
  "method": "POST",
  "path": "/api/users",
  "statusCode": 400,
  "responseTimeMs": 145,
  "operation": "create_user",
  "error": {
    "message": "Email is required",
    "name": "ValidationError",
    "stack": "ValidationError: ..."
  }
}
```

---

## 14. Security Considerations

### Rule 1: No Credentials in Errors

```typescript
// WRONG
logger.error('DB connection failed', new Error('mongodb://admin:password@host'))

// CORRECT
logger.error('DB connection failed', new Error('Database unavailable'))
```

### Rule 2: No Path Information

```typescript
// WRONG
throw new Error(`File not found: /var/data/private/users.json`)

// CORRECT
throw new Error('ENOENT: File not found')
```

### Rule 3: No User Input in Logs

```typescript
// WRONG
logger.error(`Invalid email: ${userInput}`)

// CORRECT
logger.error('Email validation failed', { inputLength: userInput.length })
```

---

## 15. Implementation Rollout

### Phase 1: Foundation (Immediate)
- ✅ Deploy error-handling utilities
- ✅ Deploy route-handler-guard
- ✅ Update critical endpoints (auth, health, brain)
- ✅ Add comprehensive tests

### Phase 2: Coverage (Week 1)
- Update remaining API endpoints
- Ensure all routes use guard pattern
- Remove all console.log/console.error calls
- Update logging to include correlation IDs

### Phase 3: Validation (Week 2)
- Run full test suite (80%+ coverage)
- Monitor error logs for patterns
- Update monitoring dashboards
- Document endpoint-specific error scenarios

### Phase 4: Optimization (Week 3)
- Analyze error patterns
- Optimize error messages
- Fine-tune rate limiting
- Add alerting for critical errors

---

## Summary

✅ **You now have:**
1. Unified error response format across all APIs
2. Reusable route guard pattern for consistent handling
3. Production-safe error messages
4. Comprehensive correlation ID tracking
5. Full logging context for debugging
6. Test suite for all error scenarios
7. Clear implementation guidelines
8. Security best practices

**Next steps:**
1. Run the test suite: `npm test error-handling`
2. Update remaining endpoints using the guard pattern
3. Deploy with monitoring enabled
4. Monitor error logs for patterns and insights
