# Error Logging Implementation Guide

## Overview
Comprehensive error logging has been implemented across all API endpoints with full context capture, correlation ID tracking, and sensitive data sanitization.

## Implementation Status

### ✅ Core Logging Infrastructure
- **Logger System** (`lib/logger.ts`)
  - Structured logging with JSON output
  - Support for debug, info, warn, error levels
  - Automatic sensitive data sanitization
  - Stack trace capture for errors
  - Timestamp generation in ISO format

- **Error Handler** (`lib/error-handler.ts`)
  - `withErrorLogging` wrapper for route handlers
  - `createErrorResponse` for consistent error responses
  - `tryCatchWithLogging` for operation-level error handling

- **Request Context Middleware** (`lib/middleware/error-context.ts`)
  - Correlation ID generation and tracking
  - Request context extraction
  - Response time tracking

- **Async Route Wrapper** (`lib/async-route.ts`)
  - Automatic error handling and logging
  - Correlation ID injection into responses
  - Operation duration tracking

### ✅ API Routes Updated
- ✅ health/route.ts - Full error logging
- ✅ alerts/route.ts - All handlers with context
- ✅ kanban/route.ts - All handlers with validation
- ✅ profiles/route.ts - Directory and profile logging

## Error Logging Pattern

Every route follows this structure:

```typescript
const startTime = Date.now()
const logContext = createLogContext({
  method: request.method,
  path: request.nextUrl.pathname,
  userId: auth.userId,
  operation: 'operation_name',
})

try {
  // Business logic
  logger.info('Success', {
    ...logContext,
    statusCode: 200,
    responseTimeMs: Date.now() - startTime,
  })
} catch (error) {
  logger.error('Failed', error, {
    ...logContext,
    statusCode: 500,
    responseTimeMs: Date.now() - startTime,
  })
}
```

## Key Features

### Correlation ID Tracking
- Unique ID per request
- Tracked across all logs
- Included in response headers
- Enables request tracing

### Sensitive Data Protection
- Passwords redacted
- Tokens sanitized
- API keys removed
- Authorization headers masked
- Nested sensitive fields recursively sanitized

### Context Information
- HTTP method and path
- User ID when available
- Operation name
- Response status code
- Operation duration
- Resource IDs
- Item counts

### Error Details
- Error name and message
- Stack trace
- Error code (if applicable)
- Error type classification

## Testing

Unit and integration tests verify:
- ✅ Logger initialization and configuration
- ✅ Sanitization of sensitive data
- ✅ Correlation ID generation
- ✅ Request context preservation
- ✅ Error formatting
- ✅ Log level filtering
- ✅ Timestamp formatting
- ✅ Response status mapping

## Best Practices

1. Always create logContext with operation name
2. Include timing information (Date.now() - startTime)
3. Log at appropriate levels (debug/info/warn/error)
4. Include business context (IDs, counts, etc.)
5. Use logger.error with full error object and context

## Monitoring

Log aggregation can use:
- **correlationId**: Trace request lifecycle
- **operation**: Filter by operation type
- **statusCode**: Filter by error type
- **duration**: Monitor performance
- **userId**: Filter by user
- **level**: Filter by severity

## References
- Logger: lib/logger.ts
- Error Handler: lib/error-handler.ts
- Tests: lib/logger.test.ts, app/api/__tests__/error-logging.test.ts
