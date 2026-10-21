# Error Handling Implementation Guide

**Status:** ✅ IMPLEMENTED & READY  
**Date:** October 22, 2026  
**Version:** 1.0

## Overview

Comprehensive centralized error handling system for all API endpoints with:
- Correlation ID propagation for request tracing
- Structured error responses with proper HTTP status codes
- Production-safe error messages
- Consistent logging with full context
- Type-safe error codes and mapping

## Architecture

### 3-Layer Error Handling Strategy

```
Layer 1: Centralized Utilities (lib/error-handling.ts)
  ├─ Error response creation
  ├─ Error code definitions
  ├─ HTTP status mapping
  ├─ Safe error message generation
  ├─ Correlation ID management
  └─ Error logging format

Layer 2: API Handler Wrapper (lib/api-error-handler.ts)
  ├─ withErrorHandler - Generic wrapper
  ├─ Method-specific wrappers (GET, POST, PUT, PATCH, DELETE)
  ├─ respondWithError - Error responses
  └─ respondWithSuccess - Success responses

Layer 3: Route Handlers (app/api/*/route.ts)
  ├─ Extract correlation ID from request
  ├─ Use wrappers or handle errors directly
  ├─ Add correlation ID to response headers
  └─ Log with request context
```

## Error Codes

Standard error codes for different failure scenarios:

```typescript
// Authentication (401/403)
AUTH_MISSING        - No token provided
AUTH_INVALID        - Invalid token format/signature
AUTH_EXPIRED        - Token expired
INSUFFICIENT_PERMISSIONS - User lacks required role

// Validation (400)
VALIDATION_ERROR    - Schema validation failed
INVALID_INPUT       - Input validation failed

// Rate Limiting (429)
RATE_LIMIT_EXCEEDED - Too many requests

// Server Errors (500/503)
INTERNAL_ERROR      - Unexpected server error
SERVICE_UNAVAILABLE - Service temporarily unavailable
NOT_FOUND           - Resource not found (404)
RESOURCE_NOT_FOUND  - Business resource not found (404)
CONFLICT            - Resource conflict (409)
```

## HTTP Status Mapping

| Code | Status | Use Case |
|------|--------|----------|
| 400 | Bad Request | Validation/input errors |
| 401 | Unauthorized | Auth missing/invalid/expired |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Error | Unexpected server error |
| 503 | Service Unavailable | Service down/timeout |

## Implementation Steps

### Step 1: Update API Endpoint Imports

```typescript
import {
  extractCorrelationFromRequest,
  createSuccessResponse,
  handleRouteError,
  formatErrorLog,
  ERROR_CODES,
} from '@/lib/error-handling'
```

### Step 2: Extract Correlation ID

```typescript
export async function GET(request: NextRequest) {
  const requestId = extractCorrelationFromRequest(request.headers)
  const startTime = Date.now()

  // ... handler implementation
}
```

### Step 3: Wrap with Try-Catch

```typescript
try {
  // ... implementation

  const responseTime = Date.now() - startTime
  logger.info('Operation successful', {
    requestId,
    statusCode: 200,
    responseTimeMs: responseTime,
  })

  const response = NextResponse.json(
    createSuccessResponse(data, requestId)
  )
  response.headers.set('x-correlation-id', requestId)
  return response
} catch (error) {
  const responseTime = Date.now() - startTime
  const { response, statusCode } = handleRouteError(error, requestId, {
    method: request.method,
    path: request.nextUrl.pathname,
    userId,
    operation: 'operation_name',
  })

  logger.error('Operation failed', error, formatErrorLog(
    'Operation error',
    error,
    {
      requestId,
      statusCode,
      responseTimeMs: responseTime,
    }
  ))

  response.headers.set('x-correlation-id', requestId)
  return response
}
```

### Step 4: Add Correlation ID to Response Headers

All responses must include the correlation ID header:

```typescript
response.headers.set('x-correlation-id', requestId)
```

## Error Response Format

### Success Response (2xx)

```json
{
  "success": true,
  "data": { /* response data */ },
  "requestId": "1698765432000-a1b2c3d4",
  "timestamp": "2026-10-22T15:30:00Z"
}
```

### Error Response (4xx/5xx)

```json
{
  "success": false,
  "error": "User-friendly error message",
  "code": "VALIDATION_ERROR",
  "requestId": "1698765432000-a1b2c3d4",
  "timestamp": "2026-10-22T15:30:00Z",
  "details": {
    "field": "email",
    "message": "Invalid email format"
  }
}
```

## Correlation ID Flow

1. **Request arrives** with optional `x-correlation-id` or `x-request-id` header
2. **Handler extracts** ID: `const requestId = extractCorrelationFromRequest(request.headers)`
3. **ID is preserved** through all logging: included in `logContext`
4. **Response includes** ID in header: `response.headers.set('x-correlation-id', requestId)`
5. **Client receives** ID for request tracing

### Tracing End-to-End

```bash
# Client initiates request with correlation ID
curl -H "x-correlation-id: trace-xyz" https://api.example.com/api/data

# Server logs with same correlation ID
logger.info('Load data', { requestId: 'trace-xyz', ... })

# Response includes correlation ID
HTTP/1.1 200 OK
x-correlation-id: trace-xyz

{
  "success": true,
  "data": {...},
  "requestId": "trace-xyz",
  ...
}

# Logs can be queried by correlation ID to trace full request lifecycle
grep "trace-xyz" /var/log/app.log
```

## Logging Strategy

### Log Context

Every log should include:
- `requestId` - For tracing
- `method` - HTTP method
- `path` - Request path
- `userId` - Authenticated user (if applicable)
- `operation` - Business operation name
- `statusCode` - HTTP status code
- `responseTimeMs` - Total request duration
- `error` - Error details (on error logs)

### Example Log Entry

```json
{
  "timestamp": "2026-10-22T15:30:00Z",
  "level": "error",
  "message": "Failed to load alerts",
  "requestId": "1698765432000-a1b2c3d4",
  "method": "GET",
  "path": "/api/alerts",
  "userId": "user-123",
  "operation": "load_alerts",
  "statusCode": 500,
  "responseTimeMs": 245,
  "error": {
    "message": "ENOENT: no such file or directory",
    "name": "Error",
    "stack": "Error: ENOENT..."
  }
}
```

## Safe Error Messages

### Development vs. Production

**Development (NODE_ENV=development):**
- All error messages are exposed
- Stack traces included
- Detailed validation errors

**Production (NODE_ENV=production):**
- Only safe messages exposed:
  - Validation errors (contain "validation" or "invalid")
  - Generic "An unexpected error occurred" for others
- No stack traces
- No sensitive information

### Safe Message Examples

```typescript
// SAFE: Validation error (exposed in both dev and prod)
"Email validation failed: must be valid email format"

// SAFE: Input validation (exposed in both dev and prod)
"Invalid input: field 'age' must be positive integer"

// UNSAFE: Database error (hidden in production)
"Database error: connection refused at db.internal:5432"
// → In production: "An unexpected error occurred"

// UNSAFE: File path (hidden in production)
"File not found at /var/data/users/sensitive.json"
// → In production: "Resource not found"
```

## Error Detection and Mapping

Common error patterns automatically mapped:

| Error Pattern | Detected By | HTTP Status | Code |
|---|---|---|---|
| Contains "validation" | Message matching | 400 | VALIDATION_ERROR |
| Contains "invalid" | Message matching | 400 | INVALID_INPUT |
| ENOENT, "not found" | Message matching | 404 | RESOURCE_NOT_FOUND |
| EACCES, "permission" | Message matching | 403 | INSUFFICIENT_PERMISSIONS |
| "timeout", ETIMEDOUT | Message matching | 503 | SERVICE_UNAVAILABLE |
| SyntaxError | Error type | 400 | INVALID_INPUT |
| Other errors | Default | 500 | INTERNAL_ERROR |

## Testing

Comprehensive test suite covers:

### Unit Tests
- Correlation ID generation and reuse
- Error response creation
- HTTP status mapping
- Safe error message generation
- Error details extraction
- Error code coverage

### Integration Tests
- End-to-end error handling
- Request context preservation
- Correlation ID propagation
- Logging accuracy
- Response format validation

### Run Tests

```bash
# Run error handling tests
npm test -- error-handling.test.ts

# Run all API tests
npm test -- api/

# Check coverage
npm test -- --coverage
```

## Quick Start Example

### Before (Without Centralized Error Handling)

```typescript
export async function GET(request: NextRequest) {
  try {
    const data = await loadData()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    // No correlation ID
    // Inconsistent error format
    // Limited context logging
    logger.error('Failed to load data', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load data' },
      { status: 500 }
    )
  }
}
```

### After (With Centralized Error Handling)

```typescript
export async function GET(request: NextRequest) {
  const requestId = extractCorrelationFromRequest(request.headers)
  const startTime = Date.now()

  try {
    const data = await loadData()

    logger.info('Data loaded successfully', {
      requestId,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    })

    const response = NextResponse.json(
      createSuccessResponse(data, requestId)
    )
    response.headers.set('x-correlation-id', requestId)
    return response
  } catch (error) {
    const { response, statusCode } = handleRouteError(error, requestId, {
      method: request.method,
      path: request.nextUrl.pathname,
      operation: 'load_data',
    })

    logger.error('Failed to load data', error, formatErrorLog(
      'Load data error',
      error,
      {
        requestId,
        statusCode,
        responseTimeMs: Date.now() - startTime,
      }
    ))

    response.headers.set('x-correlation-id', requestId)
    return response
  }
}
```

## Migration Checklist

- [ ] Import centralized error handling utilities
- [ ] Extract correlation ID from request headers
- [ ] Wrap implementation in try-catch
- [ ] Log successes with response time
- [ ] Handle errors with proper status codes
- [ ] Add correlation ID to response headers
- [ ] Update validation error responses
- [ ] Add unit tests for error paths
- [ ] Verify logging format
- [ ] Test in development environment
- [ ] Test in production-like environment
- [ ] Deploy with monitoring

## Files Changed

### Core Utilities
- `dashboard/lib/error-handling.ts` - ✅ Enhanced with helpers
- `dashboard/lib/api-error-handler.ts` - ✅ New wrapper functions

### Updated Endpoints
- `dashboard/app/api/brain/route.ts` - ✅ Implemented
- `dashboard/app/api/alerts/route.ts` - ✅ Implemented
- Other endpoints - 🔄 Ready for update (same pattern)

### Tests
- `dashboard/__tests__/api/error-handling.test.ts` - ✅ Comprehensive coverage

### Documentation
- This file - ✅ Complete
- `dashboard/docs/ERROR_HANDLING_EXAMPLES.md` - 🔄 Optional detailed examples

## Monitoring and Observability

### Key Metrics to Track

1. **Error Rate** - % of requests resulting in error
2. **Error Distribution** - Breakdown by error code
3. **Response Time** - Average and percentiles
4. **Rate Limit Violations** - 429 error count
5. **Unhandled Errors** - INTERNAL_ERROR count
6. **Validation Errors** - VALIDATION_ERROR count

### Log Aggregation

Query logs by correlation ID for complete request trace:

```bash
# View all logs for specific request
grep "1698765432000-a1b2c3d4" /var/log/app.log

# Find all errors by code
grep "VALIDATION_ERROR" /var/log/app.log | jq '.code' | sort | uniq -c

# Find slow requests
grep -E '"responseTimeMs": [0-9]{4,}' /var/log/app.log

# Find errors by operation
grep '"statusCode": 5' /var/log/app.log | jq '.operation' | sort | uniq -c
```

## Best Practices

✅ **DO:**
- Include correlation ID in all logs
- Preserve request context through error handlers
- Log error stack traces in development
- Use specific error codes for different scenarios
- Return safe messages to clients
- Include response time in logs
- Test error paths explicitly

❌ **DON'T:**
- Expose database errors to clients
- Include sensitive data in error messages
- Log without correlation ID
- Return stack traces to clients in production
- Swallow errors silently
- Use generic "Error occurred" messages in development
- Log PII in error details

## Common Errors and Solutions

| Symptom | Cause | Fix |
|---------|-------|-----|
| No correlation ID in logs | Not extracted from request | Call `extractCorrelationFromRequest()` |
| Inconsistent error format | Different handlers use different formats | Use `createErrorResponse()` everywhere |
| Missing response header | ID not added to response | Set `x-correlation-id` header |
| Can't trace request | No correlation ID | Include `requestId` in every log |
| Too much error info exposed | Production safety missing | Use `getSafeErrorMessage()` |
| Unknown error type | New error pattern not handled | Add pattern to `handleRouteError()` |

## Support and Troubleshooting

For issues or questions:

1. Check this documentation
2. Review test cases: `__tests__/api/error-handling.test.ts`
3. Check implemented examples: `app/api/brain/route.ts`, `app/api/alerts/route.ts`
4. Review error logs with correlation ID

---

**Ready to Deploy:** ✅ All systems tested and documented
