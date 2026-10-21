# Error Logging Implementation Guide

## Overview

This document describes the comprehensive error logging system implemented across all API routes in the OmniChannel dashboard. The system provides structured logging with full context, correlation IDs for request tracking, and consistent error handling patterns.

## Architecture

### Core Components

#### 1. Logger Service (`dashboard/lib/logger.ts`)
- **Purpose**: Provides structured logging with configurable log levels
- **Features**:
  - Factory pattern for creating service-specific loggers
  - Singleton instance for backward compatibility
  - Context sanitization (removes sensitive fields)
  - Error formatting with stack traces
  - Timestamp and service name in all logs

**Usage**:
```typescript
import { createLogger, createLogContext } from '@/lib/logger'

// Create a service-specific logger
const logger = createLogger('auth-service')

// Log with context
const context = createLogContext({ userId: 'user123', operation: 'login' })
logger.info('User logged in', context)
logger.error('Login failed', error, context)
```

#### 2. Error Handler Middleware (`dashboard/lib/error-handler.ts`)
- **Purpose**: Centralized error handling and response creation
- **Features**:
  - Request context extraction
  - Error response creation with proper status codes
  - Validation error logging
  - Database error handling
  - Try-catch wrapper with logging

**Key Functions**:
- `extractRequestContext()`: Extracts method, path, query, correlation ID from request
- `createErrorResponse()`: Creates consistent error responses with logging
- `withErrorLogging()`: Wraps API handlers to add automatic error logging
- `tryCatchWithLogging()`: Wraps async operations with error logging
- `logValidationError()`: Specialized error logging for validation failures
- `logDatabaseError()`: Specialized error logging for database operations

## Implementation Pattern

### Basic API Route with Error Logging

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createLogger, createLogContext, getErrorMessage } from '@/lib/logger'
import { extractRequestContext } from '@/lib/error-handler'

const logger = createLogger('my-service')

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const context = extractRequestContext(request, { serviceName: 'my-service' })

  try {
    // Log operation start
    logger.debug('Processing request', context)

    // Your operation here
    const data = await fetchData()

    // Log success
    const duration = Date.now() - startTime
    logger.info('Operation completed successfully', {
      ...context,
      statusCode: 200,
      duration,
      dataSize: data.length,
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    const duration = Date.now() - startTime
    
    // Log error with full context
    logger.error('Operation failed', error, {
      ...context,
      statusCode: 500,
      duration,
      errorType: error instanceof Error ? error.name : 'Unknown',
    })

    return NextResponse.json(
      { 
        success: false, 
        error: 'Operation failed',
        correlationId: context.correlationId 
      },
      { status: 500 }
    )
  }
}
```

## Log Context Fields

All logs include a standardized context object with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `correlationId` | string | Unique ID for request tracking (auto-generated or from header) |
| `requestId` | string | Optional: Request ID from client |
| `userId` | string | Optional: Authenticated user ID |
| `email` | string | Optional: User email |
| `operation` | string | Optional: Operation name |
| `route` | string | API route path |
| `method` | string | HTTP method (GET, POST, etc.) |
| `statusCode` | number | HTTP response status code |
| `duration` | number | Operation duration in milliseconds |
| `path` | string | Full request path |
| `query` | object | Query parameters |
| `userAgent` | string | Client user agent |
| `authenticated` | boolean | Authentication status |
| `[key: string]` | unknown | Additional custom fields |

## Log Levels

### DEBUG
- Used for detailed diagnostic information
- Only logged in development or when DEBUG=true
- Examples: parsing steps, component initialization

```typescript
logger.debug('Parsed request body', { ...context, bodySize: body.length })
```

### INFO
- Used for informational messages about normal operation
- Logged in all environments
- Examples: successful operations, state changes

```typescript
logger.info('Request completed successfully', { ...context, statusCode: 200 })
```

### WARN
- Used for potentially problematic situations
- Logged in all environments
- Examples: validation failures, rate limit exceeded, missing optional data

```typescript
logger.warn('Validation failed', { ...context, missingField: 'email' })
```

### ERROR
- Used for error conditions that need attention
- Always includes error object with stack trace
- Examples: database failures, exceptions, server errors

```typescript
logger.error('Database query failed', dbError, { ...context, query: 'SELECT ...' })
```

## Sensitive Data Protection

The logger automatically sanitizes context before logging. The following fields are redacted:
- `password`
- `token`
- `accessToken`
- `refreshToken`
- `apiKey`
- `secret`
- `sessionId`
- `creditCard`
- `ssn`
- Any field whose name contains these keywords (case-insensitive)

**Example**:
```typescript
logger.info('User login', {
  userId: 'user123',
  email: 'user@example.com',
  password: 'secret123' // This will be redacted as [REDACTED]
})
```

## Correlation ID Tracking

Every request gets a unique correlation ID for end-to-end tracking:

1. **Generated automatically**: If not provided, a UUID v4 is generated
2. **From header**: Can be passed via `x-correlation-id` header
3. **Used in responses**: Included in error responses for client reference

**Usage**:
```typescript
// Client sends request with correlation ID
const response = await fetch('/api/endpoint', {
  headers: { 'x-correlation-id': 'my-tracking-id-123' }
})

// Server logs all operations with this ID
// If error occurs, client receives correlation ID in response
// Client can use this ID to find logs in log aggregation system
```

## Error Response Format

All error responses follow a consistent format:

```json
{
  "success": false,
  "error": "Error message",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "details": "Optional detailed error message",
  "field": "Optional field name for validation errors"
}
```

## HTTP Status Codes

The error logging system maps errors to appropriate HTTP status codes:

| Status | Condition | Example |
|--------|-----------|---------|
| 400 | Invalid input, validation failed | Missing required field, invalid format |
| 403 | Unauthorized or forbidden | User lacks permission |
| 404 | Not found | Resource doesn't exist |
| 429 | Rate limited | Too many requests |
| 500 | Server error | Database failure, uncaught exception |

## Testing Error Logging

### Unit Tests
See `dashboard/lib/error-handler.test.ts` for comprehensive test examples.

**Test Pattern**:
```typescript
it('should log errors with full context', () => {
  const context = createLogContext({ userId: 'user123' })
  const error = new Error('Test error')

  logger.error('Operation failed', error, context)

  expect(loggerMock.error).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      userId: 'user123',
      correlationId: expect.any(String),
    })
  )
})
```

### Integration Tests
Test full request/response cycle with error logging:

```typescript
it('should log 404 errors for missing resources', async () => {
  const response = await fetch('/api/users/nonexistent', {
    headers: { 'x-correlation-id': 'test-id-123' }
  })

  expect(response.status).toBe(404)
  const body = await response.json()
  expect(body.correlationId).toBe('test-id-123')

  // Check logs for this correlation ID
  // Verify error was logged with full context
})
```

## Current Implementation Status

### Completed Routes
- ✅ `GET /api/health` - Full error logging with component diagnostics
- ✅ `POST /api/auth` - Error logging with rate limiting context
- ✅ `GET /api/alerts` - Error logging implemented
- ✅ `GET /api/brain` - Error logging with directory operations context
- ✅ Error Handler Middleware - Available for all routes
- ✅ Logger Service - Fully implemented with factory and singleton patterns

### Migration Checklist for Remaining Routes

For each API route, follow these steps:

1. **Import logger and utilities**:
   ```typescript
   import { createLogger, createLogContext } from '@/lib/logger'
   import { extractRequestContext } from '@/lib/error-handler'
   ```

2. **Create service logger**:
   ```typescript
   const logger = createLogger('service-name')
   ```

3. **Extract request context**:
   ```typescript
   const context = extractRequestContext(request)
   ```

4. **Wrap main logic in try-catch**:
   ```typescript
   try {
     // Log start
     logger.debug('Operation started', context)
     
     // Do work
     const result = await operation()
     
     // Log success
     logger.info('Operation succeeded', { ...context, statusCode: 200 })
     return success response
   } catch (error) {
     // Log error
     logger.error('Operation failed', error, { ...context, statusCode: 500 })
     return error response
   }
   ```

5. **Include context in error responses**:
   ```typescript
   return NextResponse.json(
     { error: 'Message', correlationId: context.correlationId },
     { status: 500 }
   )
   ```

## Log Aggregation Integration

The structured JSON logs are ready for integration with services like:
- **Datadog**: Direct JSON ingestion
- **CloudWatch**: Log Insights JSON parsing
- **ELK Stack**: JSON parsing and field indexing
- **Splunk**: Structured data indexing

Example log entry:
```json
{
  "timestamp": "2024-10-22T10:30:45.123Z",
  "level": "ERROR",
  "service": "auth-service",
  "message": "Auth token generation failed",
  "context": {
    "correlationId": "550e8400-e29b-41d4-a716-446655440000",
    "method": "POST",
    "path": "/api/auth",
    "statusCode": 500,
    "duration": 1234,
    "userId": "[REDACTED]",
    "operation": "token_generation"
  },
  "error": {
    "name": "Error",
    "message": "ENOENT: no such file or directory",
    "stack": "Error: ENOENT: ...",
    "code": "ENOENT"
  }
}
```

## Best Practices

1. **Always include duration**: Track operation timing for performance analysis
   ```typescript
   const duration = Date.now() - startTime
   logger.info('Operation completed', { ...context, duration })
   ```

2. **Use appropriate log levels**: Don't log everything at ERROR level
   ```typescript
   logger.debug('Processing step 1')  // Details
   logger.info('Processing started')  // Normal flow
   logger.warn('Slow operation')      // Attention needed
   logger.error('Failed', error)      // Errors only
   ```

3. **Include error type**: Helps categorize errors
   ```typescript
   logger.error('Failed', error, {
     ...context,
     errorType: error instanceof Error ? error.name : typeof error
   })
   ```

4. **Avoid logging sensitive data**: Trust the sanitization, but don't pass secrets
   ```typescript
   // ✅ OK - sanitized automatically
   logger.info('Request', { password: 'secret' })
   
   // ❌ WRONG - don't include secrets
   logger.info('Using key', { apiKey: process.env.API_KEY })
   ```

5. **Use correlation IDs for tracking**: Include in responses for client support
   ```typescript
   return NextResponse.json(
     { error: 'Something went wrong', correlationId: context.correlationId },
     { status: 500 }
   )
   ```

## Debugging with Error Logs

When a user reports an issue, you can search logs using the correlation ID:

```bash
# Datadog
logs where correlation_id:"550e8400-e29b-41d4-a716-446655440000"

# CloudWatch
fields @timestamp, @message, @context 
| filter correlationId = "550e8400-e29b-41d4-a716-446655440000"

# ELK
correlation_id: "550e8400-e29b-41d4-a716-446655440000"
```

This shows the complete request flow from start to finish.

## Configuration

### Environment Variables

- `DEBUG=true` - Enable debug-level logging
- `LOG_LEVEL=warn` - Set minimum log level (debug, info, warn, error)

### Service-Specific Loggers

```typescript
// Development - all levels
const logger = createLogger('service', { enableDebug: true })

// Production - info and above
const logger = createLogger('service', { enableDebug: false })
```

## Metrics & Monitoring

The error logging provides data for:
- **Error rate**: Count of ERROR logs per service
- **Slow operations**: Operations with duration > threshold
- **User impact**: Errors by userId
- **Response times**: Histogram of duration fields
- **Validation failures**: Count of 400 errors by field

Example metrics query:
```
service: "auth-service" AND level: "ERROR"
| stats count as error_count, avg(duration) as avg_response_time by statusCode
```

## Support & Troubleshooting

### Logs not appearing
1. Check `LOG_LEVEL` environment variable
2. Verify logger service name matches filter
3. Ensure `console.log` is configured for production logging

### Correlation ID not found
1. Verify header is included in request: `x-correlation-id: value`
2. Check if middleware is extracting it correctly
3. Ensure response includes correlation ID in body

### Sensitive data in logs
1. Add field name to `sanitizeContext` function
2. Avoid logging request bodies directly
3. Use LogContext for structured data instead

---

**Last Updated**: 2024-10-22
**Status**: Production Ready
