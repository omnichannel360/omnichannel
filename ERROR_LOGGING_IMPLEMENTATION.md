# Error Logging Implementation Guide

## Overview
Comprehensive error logging system with context, sanitization, and structured output for all API endpoints and error handlers.

## Implementation Status

### ✅ COMPLETED
- **Logger Implementation**: `dashboard/lib/logger.ts`
  - Factory function: `createLogger(serviceName, options)`
  - Class-based Logger with public `serviceName` property
  - Methods: `debug()`, `info()`, `warn()`, `error()`, `logOperation()`
  - Automatic sanitization of sensitive fields
  - Structured JSON output with timestamps
  - Stack trace extraction and formatting
  - Context nesting support

### 🔄 Integration - API Routes

#### Routes Using Logger Pattern (✅)
- **kanban/route.ts** - Full implementation

#### Routes Needing Logger Integration
1. auth/login/route.ts - HIGH PRIORITY
2. auth/route.ts
3. auth/verify/route.ts
4. health/route.ts
5. meetings/route.ts
6. metrics/route.ts
7. alerts/route.ts
8. profiles/route.ts
9. brain/route.ts
10. conductor/route.ts

## Standard Pattern

```typescript
import { createLogger, createLogContext } from '@/lib/logger'
const logger = createLogger('endpoint-name')

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    operation: 'describe_operation',
  })

  try {
    const result = await operation()
    logger.info('Operation succeeded', {
      ...logContext,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    logger.error('Operation failed', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json(
      { success: false, error: 'Operation failed' },
      { status: 500 }
    )
  }
}
```

## Sensitive Field Sanitization

Automatically redacted: password, token, apiKey, secret, sessionId, creditCard, ssn, Authorization

## Logger Test Coverage

File: `dashboard/lib/logger.test.ts`
- ✅ Logger instantiation
- ✅ Error logging with context
- ✅ Request context logging
- ✅ Auth context logging
- ✅ Timing information
- ✅ Log levels (ERROR, WARN, INFO, DEBUG)
- ✅ Error object handling
- ✅ Service name context
- ✅ Structured JSON logging
- ✅ Context sanitization
- ✅ Multiple error sources

## Implementation Checklist

### Phase 1: Core Routes (CRITICAL)
- [ ] auth/login/route.ts - Add logger to login handler
- [ ] auth/route.ts - Verify auth checking
- [ ] auth/verify/route.ts - Token verification

### Phase 2: API Routes
- [ ] kanban/route.ts - Already complete
- [ ] meetings/route.ts
- [ ] metrics/route.ts
- [ ] profiles/route.ts

### Phase 3: Support Routes
- [ ] health/route.ts
- [ ] alerts/route.ts
- [ ] brain/route.ts
- [ ] conductor/route.ts

## Summary

✅ Logger implementation: COMPLETE (100%)
⏳ API integration: IN PROGRESS (10%)
- Kanban route: Done
- 9 routes remaining

Status: Ready for production, rollout in progress
