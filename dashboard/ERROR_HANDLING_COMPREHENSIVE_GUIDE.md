# Comprehensive Error Handling Implementation Guide

**Status:** In Progress  
**Date:** 2026-10-22  
**Target:** All API Endpoints

## Overview

This document defines the unified error handling strategy for all API endpoints in the OmniChannel dashboard. The strategy ensures:
- Consistent error response format across all routes
- Proper HTTP status codes
- No sensitive data leakage in production
- Comprehensive error logging
- Client-friendly error messages

---

## 1. Error Response Format (Standard for All Endpoints)

### Success Response
```typescript
{
  "success": true,
  "data": <payload>,
  "requestId": "1698765432000-a1b2c3d4",
  "timestamp": "2026-10-22T10:30:45.123Z"
}
```

### Error Response
```typescript
{
  "success": false,
  "error": "User-friendly error message",
  "code": "ERROR_CODE",
  "requestId": "1698765432000-a1b2c3d4",
  "timestamp": "2026-10-22T10:30:45.123Z",
  "details": {
    // Only in development mode or for specific validation errors
    "field": "specific error details"
  }
}
```

---

## 2. Error Categories & HTTP Status Codes

| Category | Code | HTTP Status | Use Case |
|----------|------|-------------|----------|
| **Authentication** | AUTH_MISSING | 401 | Missing JWT token |
| | AUTH_INVALID | 401 | Invalid/malformed token |
| | AUTH_EXPIRED | 401 | Expired token |
| **Authorization** | INSUFFICIENT_PERMISSIONS | 403 | User lacks required role |
| **Validation** | VALIDATION_ERROR | 400 | Schema validation failed |
| | INVALID_INPUT | 400 | Business logic validation failed |
| **Rate Limiting** | RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| **Resource** | RESOURCE_NOT_FOUND | 404 | Requested resource doesn't exist |
| | CONFLICT | 409 | Duplicate key/state conflict |
| **Server** | INTERNAL_ERROR | 500 | Unexpected server error |
| | SERVICE_UNAVAILABLE | 503 | Dependency unavailable |

---

## 3. Error Handling Pattern (Template for All Routes)

### Basic Structure
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createLogger, createLogContext } from '@/lib/logger'
import {
  getOrCreateCorrelationId,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  getSafeErrorMessage,
  formatErrorLog,
} from '@/lib/error-handling'

const logger = createLogger('module-name')

export async function GET(request: NextRequest) {
  // 1. Setup
  const correlationId = getOrCreateCorrelationId(
    request.headers.get('x-correlation-id')
  )
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    correlationId,
  })

  try {
    // 2. Validate inputs
    // - Query parameters
    // - Headers
    // - Body (if applicable)

    // 3. Perform business logic
    
    // 4. Return success
    return NextResponse.json(
      createSuccessResponse(data, correlationId),
      { status: 200 }
    )

  } catch (error) {
    // 5. Handle errors
    const errorMessage = getSafeErrorMessage(error, 'Operation failed')
    const statusCode = getHttpStatus(ERROR_CODE)
    
    logger.error(
      errorMessage,
      formatErrorLog('Operation failed', error, {
        ...logContext,
        statusCode,
      })
    )

    return createErrorResponse(
      errorMessage,
      ERROR_CODE,
      correlationId,
      statusCode
    )
  }
}
```

---

## 4. Specific Error Handling by Scenario

### 4.1 Input Validation Errors

**When:**
- Query parameters missing or invalid
- Body payload doesn't match schema
- Field-level validation fails

**Implementation:**
```typescript
const queryResult = await validateQuery(request, Schema)
if (!queryResult.success) {
  return queryResult.response // Already formatted error
}

// Or manual validation:
if (!email || !email.includes('@')) {
  return createErrorResponse(
    'Email must be valid',
    ERROR_CODES.INVALID_INPUT,
    correlationId,
    400,
    { field: 'email' } // Only in details if relevant
  )
}
```

### 4.2 File System Errors

**When:**
- File not found
- Permission denied
- Path traversal attempt

**Implementation:**
```typescript
try {
  const data = await atomicRead(filePath)
} catch (error) {
  if (error instanceof FileNotFoundError) {
    return createErrorResponse(
      'Resource not found',
      ERROR_CODES.RESOURCE_NOT_FOUND,
      correlationId,
      404
    )
  }
  
  // Generic error for permission/access issues
  return createErrorResponse(
    'Unable to read resource',
    ERROR_CODES.INTERNAL_ERROR,
    correlationId,
    500
  )
}
```

### 4.3 Database/Query Errors

**When:**
- Query fails
- Constraint violation
- Connection error

**Implementation:**
```typescript
try {
  const result = await db.query(sql)
} catch (error) {
  if (error instanceof ConstraintError) {
    return createErrorResponse(
      'Resource already exists',
      ERROR_CODES.CONFLICT,
      correlationId,
      409
    )
  }
  
  if (error instanceof ConnectionError) {
    return createErrorResponse(
      'Service temporarily unavailable',
      ERROR_CODES.SERVICE_UNAVAILABLE,
      correlationId,
      503
    )
  }
  
  // Generic error
  return createErrorResponse(
    'Operation failed',
    ERROR_CODES.INTERNAL_ERROR,
    correlationId,
    500
  )
}
```

### 4.4 Rate Limiting

**When:**
- User exceeds request quota

**Implementation:**
```typescript
const rateLimitError = await applyRateLimit(request, 'endpoint-name')
if (rateLimitError) return rateLimitError
```

### 4.5 External API Errors

**When:**
- Third-party API fails
- Timeout occurs
- Invalid response

**Implementation:**
```typescript
try {
  const result = await externalApi.call(params)
} catch (error) {
  logger.error('External API error', formatErrorLog('API call failed', error, {
    ...logContext,
    apiName: 'example-api',
    statusCode: 500,
  }))
  
  return createErrorResponse(
    'Unable to complete operation',
    ERROR_CODES.SERVICE_UNAVAILABLE,
    correlationId,
    503
  )
}
```

---

## 5. Logging Strategy

### Log Levels

| Level | When | Destination |
|-------|------|-------------|
| **error** | Exception thrown, 5xx response | Error logs, alerts |
| **warn** | Validation fails, 4xx response | Warning logs |
| **info** | Successful operations | Info logs |
| **debug** | Detailed execution flow | Debug logs only |

### Information to Log

**Always Include:**
- Correlation ID (for tracing)
- Timestamp
- HTTP method & path
- User ID (from auth context)
- Error code
- Error message

**Never Log:**
- Passwords or tokens
- API keys
- Personal data
- File system paths (in production)
- Stack traces (in production)

### Example Log Entry
```typescript
{
  "timestamp": "2026-10-22T10:30:45.123Z",
  "level": "error",
  "message": "Failed to process request",
  "correlationId": "1698765432000-a1b2c3d4",
  "requestId": "1698765432000-a1b2c3d4",
  "method": "POST",
  "path": "/api/alerts",
  "userId": "user-123",
  "statusCode": 400,
  "errorCode": "VALIDATION_ERROR",
  "error": {
    "message": "Invalid alert type",
    "name": "ValidationError"
  }
}
```

---

## 6. Implementation Checklist

### For Each API Endpoint

- [ ] Import error handling utilities
- [ ] Create logger instance
- [ ] Extract/create correlation ID
- [ ] Create log context
- [ ] Validate all inputs (query, body, headers)
- [ ] Wrap business logic in try-catch
- [ ] Handle each error type specifically
- [ ] Return formatted error responses
- [ ] Log with full context
- [ ] Write tests for each error path
- [ ] Verify no sensitive data in responses

### Security Checks

- [ ] getSafeErrorMessage prevents exposure in production
- [ ] Stack traces not returned to client
- [ ] File paths not exposed
- [ ] Database details not exposed
- [ ] API keys/secrets not in logs
- [ ] User data sanitized in error messages

---

## 7. Endpoints Requiring Implementation

| Endpoint | Module | Priority | Status |
|----------|--------|----------|--------|
| GET /api/brain | brain | High | To Fix |
| POST /api/conductor | conductor | High | To Fix |
| GET/POST /api/alerts | alerts | High | To Fix |
| GET/POST /api/metrics | metrics | High | To Fix |
| GET/PUT /api/profiles | profiles | High | To Fix |
| GET/POST /api/kanban | kanban | High | To Fix |
| GET/POST /api/meetings | meetings | Medium | To Fix |
| POST /api/auth | auth | High | To Fix |
| POST /api/auth/login | auth/login | High | To Fix |
| POST /api/auth/verify | auth/verify | High | To Fix |

---

## 8. Testing Strategy

### Test Coverage Requirements

- **Unit Tests:** 80%+ coverage of error paths
- **Integration Tests:** End-to-end error scenarios
- **Security Tests:** Verify no data leakage

### Test Scenarios Per Endpoint

1. Valid request → 200 OK
2. Missing required field → 400 VALIDATION_ERROR
3. Invalid field type → 400 INVALID_INPUT
4. Unauthorized (no token) → 401 AUTH_MISSING
5. Forbidden (insufficient role) → 403 INSUFFICIENT_PERMISSIONS
6. Resource not found → 404 RESOURCE_NOT_FOUND
7. Conflict (duplicate) → 409 CONFLICT
8. Rate limit exceeded → 429 RATE_LIMIT_EXCEEDED
9. Internal error → 500 INTERNAL_ERROR
10. Service unavailable → 503 SERVICE_UNAVAILABLE

### Test File Template
```typescript
describe('Error Handling - [Endpoint]', () => {
  test('returns 400 when required field missing', async () => {
    const response = await fetch('/api/endpoint', {
      method: 'POST',
      body: JSON.stringify({})
    })
    
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.code).toBe('VALIDATION_ERROR')
    expect(data.success).toBe(false)
    expect(data.requestId).toBeDefined()
    expect(data.timestamp).toBeDefined()
  })
  
  // More tests for each error scenario...
})
```

---

## 9. Rollout Plan

### Phase 1: Foundation (Now)
- [x] Error handling utilities created
- [x] Logging infrastructure ready
- [x] Auth middleware implemented
- [ ] Comprehensive test suite created
- [ ] Error handling template validated

### Phase 2: Implementation (This Sprint)
- [ ] Fix /api/brain error handling
- [ ] Fix /api/conductor error handling
- [ ] Fix /api/alerts error handling
- [ ] Fix /api/metrics error handling
- [ ] Fix /api/profiles error handling
- [ ] Fix /api/kanban error handling
- [ ] Run tests for each endpoint
- [ ] Code review for each implementation

### Phase 3: Verification (Next Sprint)
- [ ] Integration tests passing
- [ ] Security tests passing
- [ ] Load testing with error scenarios
- [ ] Production monitoring setup
- [ ] Documentation complete

### Phase 4: Monitoring (Ongoing)
- [ ] Track error rates by code
- [ ] Monitor for data leakage attempts
- [ ] Alert on unexpected error patterns
- [ ] Regular security audits

---

## 10. References

- **Error Handling Module:** `dashboard/lib/error-handling.ts`
- **Logger Module:** `dashboard/lib/logger.ts`
- **Test Examples:** `dashboard/app/api/__tests__/error-logging.test.ts`
- **Validation Module:** `dashboard/lib/validation/middleware.ts`
- **Protected Routes:** `dashboard/lib/protected-route.ts`

---

## 11. Success Criteria

- ✅ All API endpoints have consistent error responses
- ✅ No sensitive data leakage in responses
- ✅ All error scenarios return appropriate HTTP status codes
- ✅ Error codes match HTTP semantics
- ✅ 80%+ test coverage for error paths
- ✅ Comprehensive error logging with correlation IDs
- ✅ Production safety verified
- ✅ Security review passed
- ✅ Documentation complete
- ✅ Team trained on pattern

---

**Implementation Start:** 2026-10-22  
**Target Completion:** 2026-10-25  
**Owner:** Claude Haiku 4.5  
**Review Required Before:** Production Deployment
