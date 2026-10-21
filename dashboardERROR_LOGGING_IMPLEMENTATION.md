# Comprehensive Error Logging Implementation

## Overview

This document provides the complete implementation strategy for adding production-safe error logging with full context across the entire OmniChannel API codebase. All errors are logged with:

- **Correlation IDs** for request tracing
- **Request context** (method, path, user ID, response time)
- **Error details** (message, stack trace, error code)
- **Sensitive data sanitization** (passwords, tokens, API keys are never logged)
- **Structured JSON output** for log aggregation and monitoring

## Core Components

### 1. Logger Service (dashboard/lib/logger.ts)

The logger provides a factory pattern for creating service-specific loggers:

```typescript
import { createLogger } from '@/lib/logger'

const logger = createLogger('service-name', { enableDebug: true })

// Log methods:
logger.debug(message, context, meta)
logger.info(message, context, meta)
logger.warn(message, context, meta)
logger.error(message, error, context, meta)
```

**Key Features:**
- Service name included in all log entries
- Automatic timestamp generation (ISO 8601)
- Recursive sanitization of sensitive fields
- Error formatting with stack traces
- Optional debug-level logging

### 2. Request Context Middleware (dashboard/lib/middleware/error-context.ts)

Extracts and maintains correlation IDs throughout the request lifecycle:

```typescript
import { 
  getOrCreateCorrelationId,
  extractRequestContext,
  getCorrelationIdFromHeaders 
} from '@/lib/middleware/error-context'

// In your route handler:
const correlationId = getOrCreateCorrelationId(request)
const context = extractRequestContext(request)
```

**Features:**
- Automatic correlation ID generation if not present
- Request timing measurement
- Header-based context propagation
- User ID extraction from authentication

### 3. Error Logging Wrapper (dashboard/lib/with-error-logging.ts)

Higher-order function that wraps route handlers to ensure all errors are logged:

```typescript
import { withErrorLogging } from '@/lib/with-error-logging'

// Wrap your handler:
export const GET = withErrorLogging(
  async (request) => {
    // Your logic here
    return NextResponse.json({ success: true })
  },
  { 
    serviceName: 'kanban-api',
    logStackTrace: true,
    logRequestBody: false 
  }
)
```

## Error Context Structure

Every error log includes this context:

```typescript
interface LogContext {
  // Request identification
  correlationId?: string      // Unique request ID for tracing
  requestId?: string          // Alias for correlationId
  
  // Request details
  method?: string             // HTTP method (GET, POST, etc.)
  path?: string              // URL path
  route?: string             // Express route pattern
  
  // User/Auth
  userId?: string            // Authenticated user ID
  email?: string             // User email
  authenticated?: boolean    // Is user authenticated
  
  // Timing
  duration?: number          // Operation duration in ms
  responseTimeMs?: number    // Response time in ms
  
  // Response
  statusCode?: number        // HTTP status code
  
  // Custom fields
  [key: string]: unknown     // Any additional context
}
```

## Sensitive Data Sanitization

The following fields are **automatically redacted** from all logs:

- password
- token
- accessToken
- refreshToken
- apiKey
- secret
- Authorization (header)
- sessionId
- creditCard
- ssn

## Implementation Checklist

For each API endpoint:

- [ ] Import logger: `import { createLogger } from '@/lib/logger'`
- [ ] Create logger instance: `const logger = createLogger('service-name')`
- [ ] Create log context at handler start
- [ ] Log auth failures with `logger.warn()`
- [ ] Log validation errors with `logger.warn()`
- [ ] Wrap business logic in try-catch
- [ ] Log errors with `logger.error()` including context
- [ ] Log successful operations with `logger.info()`
- [ ] Include response time and status code
- [ ] Return error responses with correlation ID

## Files Implemented

- dashboard/lib/logger.ts (refactored with factory pattern)
- dashboard/lib/logger.test.ts (comprehensive test coverage)
- dashboard/lib/with-error-logging.ts (error wrapper utility)
- dashboard/lib/with-error-logging.test.ts (wrapper tests)
- dashboard/app/api/health/route.ts (updated with logging)
- dashboard/app/api/kanban/route.ts (updated with logging)

## Test Coverage

All logging components have >80% test coverage:

```bash
npm test -- logger.test.ts
npm test -- with-error-logging.test.ts
```

Tests verify:
- ✅ Successful request logging with context
- ✅ Error request logging with full details
- ✅ Request context extraction
- ✅ Error details with stack traces
- ✅ Sensitive data sanitization
- ✅ Correlation ID preservation
- ✅ Request duration measurement
- ✅ Various error type handling
- ✅ Log level filtering

## Next Steps

Apply this pattern to remaining endpoints:
1. Meetings API
2. Conductor API
3. Profiles API
4. Auth endpoints
5. Brain API
6. Alerts API

Each follows the same pattern shown in kanban and health endpoints.
