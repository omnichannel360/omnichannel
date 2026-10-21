# Error Handling Refactoring Example: Before & After

## Real-World Example: Conductor API Endpoint

This shows the actual refactoring applied to fix error handling across all APIs.

---

## BEFORE: Inconsistent Error Handling

```typescript
// ❌ PROBLEMS:
// - Uses console.error instead of logger
// - No correlation ID propagation
// - Inconsistent error responses
// - No structured logging context
// - Missing error codes
// - Doesn't return proper HTTP status codes

import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

async function loadSkillRegistry(): Promise<SkillRegistry | null> {
  try {
    const data = await fs.readFile(SKILL_REGISTRY_PATH, 'utf-8')
    try {
      return JSON.parse(data)
    } catch (parseError) {
      // ❌ Using console.error
      const message = parseError instanceof Error ? parseError.message : 'Unknown parse error'
      console.error('[ConductorAPI] JSON parse error when loading skill registry:', message)
      return null
    }
  } catch (readError) {
    // ❌ Using console.debug
    const message = readError instanceof Error ? readError.message : 'Unknown read error'
    console.debug('[ConductorAPI] Skill registry file not found or unreadable:', message)
    return null
  }
}

async function loadLogs(): Promise<ConversationLog[]> {
  return withFileLock(LOG_FILE, async () => {
    await ensureDataDir(path.dirname(LOG_FILE))
    try {
      const data = await fs.readFile(LOG_FILE, 'utf-8')
      try {
        return JSON.parse(data)
      } catch (parseError) {
        // ❌ No correlation ID tracking
        const message = parseError instanceof Error ? parseError.message : 'Unknown parse error'
        console.error('[ConductorAPI] JSON parse error when loading logs:', message)
        return []
      }
    } catch (readError) {
      const message = readError instanceof Error ? readError.message : 'Unknown read error'
      console.error('[ConductorAPI] Error reading logs file:', message)
      return []
    }
  })
}

export async function POST(request: NextRequest) {
  try {
    // ❌ No correlation ID extraction
    // ❌ No structured logging
    // ❌ Missing error classification
    
    const body = await request.json()
    const logs = await loadLogs()
    const registry = await loadSkillRegistry()
    
    // Process request...
    
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    // ❌ Generic error response, no error code
    // ❌ No request ID for tracing
    // ❌ No context in logs
    console.error('Error in conductor API:', error)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

---

## AFTER: Comprehensive Error Handling

```typescript
// ✅ IMPROVEMENTS:
// - Uses structured logger
// - Full correlation ID propagation
// - Consistent error responses with codes
// - Complete logging context
// - Proper HTTP status codes
// - Production-safe error messages

import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { createLogger } from '@/lib/logger'
import { guardRoute } from '@/lib/route-handler-guard'
import {
  extractCorrelationFromRequest,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  getErrorDetails,
} from '@/lib/error-handling'

const logger = createLogger('conductor-api')

async function loadSkillRegistry(requestId: string): Promise<SkillRegistry | null> {
  try {
    const data = await fs.readFile(SKILL_REGISTRY_PATH, 'utf-8')
    try {
      return JSON.parse(data)
    } catch (parseError) {
      // ✅ Structured logging with context
      logger.error('Failed to parse skill registry', parseError, {
        requestId,
        operation: 'parse_skill_registry',
        path: SKILL_REGISTRY_PATH,
      })
      return null
    }
  } catch (readError) {
    // ✅ Different log level for missing file vs parse error
    logger.warn('Failed to load skill registry', {
      requestId,
      operation: 'load_skill_registry',
      path: SKILL_REGISTRY_PATH,
      error: readError instanceof Error ? readError.message : String(readError),
    })
    return null
  }
}

async function loadLogs(requestId: string): Promise<ConversationLog[]> {
  return withFileLock(LOG_FILE, async () => {
    await ensureDataDir(path.dirname(LOG_FILE))
    try {
      const data = await fs.readFile(LOG_FILE, 'utf-8')
      try {
        return JSON.parse(data)
      } catch (parseError) {
        // ✅ Structured logging with correlation ID
        logger.error('Failed to parse conductor logs', parseError, {
          requestId,
          operation: 'parse_conductor_logs',
          path: LOG_FILE,
        })
        return []
      }
    } catch (readError) {
      // ✅ Proper error context
      logger.error('Failed to read conductor logs', readError, {
        requestId,
        operation: 'read_conductor_logs',
        path: LOG_FILE,
      })
      return []
    }
  })
}

// ✅ Using guard pattern - handles all cross-cutting concerns
export const POST = guardRoute(
  async (request, context) => {
    const { requestId, userId, startTime } = context
    
    try {
      // ✅ Request ID available throughout handler
      const body = await request.json()
      
      // ✅ Pass correlation ID to helper functions
      const logs = await loadLogs(requestId)
      const registry = await loadSkillRegistry(requestId)
      
      // Validate body
      const validation = ConductorRequestSchemaComprehensive.safeParse(body)
      if (!validation.success) {
        logger.warn('Conductor request validation failed', {
          requestId,
          userId,
          statusCode: 400,
          responseTimeMs: Date.now() - startTime,
        })
        
        return createErrorResponse(
          'Request validation failed',
          ERROR_CODES.VALIDATION_ERROR,
          requestId,
          400,
          { errors: validation.error.flatten() }
        )
      }
      
      // Process request...
      const result = await processConductorRequest(
        validation.data,
        logs,
        registry,
        requestId
      )
      
      // ✅ Structured success response
      logger.info('Conductor request processed successfully', {
        requestId,
        userId,
        statusCode: 200,
        responseTimeMs: Date.now() - startTime,
      })
      
      return NextResponse.json(
        createSuccessResponse(result, requestId)
      )
    } catch (error) {
      // ✅ Error is automatically caught by guard wrapper
      // ✅ Full context is logged
      // ✅ Safe error message returned to client
      throw error // Guard handles this
    }
  },
  {
    requireAuth: true,
    operation: 'conductor_dispatch',
    rateLimit: 'conductor',
  }
)
```

---

## Key Improvements Breakdown

### 1. Logger Integration

**BEFORE:**
```typescript
console.error('[ConductorAPI] JSON parse error:', message)
```

**AFTER:**
```typescript
logger.error('Failed to parse conductor logs', parseError, {
  requestId,
  operation: 'parse_conductor_logs',
  path: LOG_FILE,
})
```

**Why:** 
- Structured logging enables search and filtering
- Correlation ID enables request tracing
- Operation context helps debugging
- Sensitive paths are still logged in development/staging but filtered in production

### 2. Error Classification

**BEFORE:**
```typescript
if (parseError) {
  console.error(...)
  return null
}
```

**AFTER:**
```typescript
// Parse error - structural issue
logger.error('Failed to parse conductor logs', parseError, { ... })

// Read error - file not found or permission denied
logger.warn('Failed to load skill registry', { ... })
```

**Why:**
- Different error types need different responses
- Parse errors indicate data corruption
- Missing files might be expected in some scenarios
- Log levels match severity

### 3. Correlation ID Propagation

**BEFORE:**
```typescript
async function loadLogs(): Promise<ConversationLog[]> {
  // No way to track this request
}

export async function POST(request: NextRequest) {
  // No request ID extracted
  const logs = await loadLogs()
}
```

**AFTER:**
```typescript
async function loadLogs(requestId: string): Promise<ConversationLog[]> {
  // Every operation includes request ID
  logger.error('Failed...', error, { requestId, ... })
}

export const POST = guardRoute(async (request, context) => {
  // Correlation ID available everywhere
  const logs = await loadLogs(context.requestId)
})
```

**Why:**
- Correlation IDs enable end-to-end tracing
- Each log entry can be tied back to the original request
- Helps diagnose issues across distributed systems

### 4. Response Format Consistency

**BEFORE:**
```typescript
// Inconsistent responses
return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
// or
return NextResponse.json({ success: true, data: result })
// or
return NextResponse.json(data)
```

**AFTER:**
```typescript
// Consistent envelope for all responses
return NextResponse.json(
  createSuccessResponse(result, requestId),
  { status: 200 }
)
// or
return createErrorResponse(
  'User-friendly message',
  ERROR_CODES.VALIDATION_ERROR,
  requestId,
  400,
  { details: validationError }
)
```

**Why:**
- Clients can parse responses consistently
- Error codes enable programmatic error handling
- Request ID enables client-side tracing support
- Timestamp enables request duration calculation

### 5. Security Improvements

**BEFORE:**
```typescript
catch (readError) {
  // Might expose file paths or connection strings
  console.error('[ConductorAPI] Error:', readError.message)
}
```

**AFTER:**
```typescript
catch (readError) {
  // Safe fallback message to client
  logger.error('Failed to load skill registry', readError, {
    requestId,
    operation: 'load_skill_registry',
    // Full details logged server-side only
  })
  // Returns generic safe message to client
  return null
}
```

**Why:**
- Sensitive details logged on server, not exposed to clients
- Production environment filters sensitive messages automatically
- Prevents information disclosure vulnerabilities

---

## Testing Comparison

### BEFORE: Limited Testing

```typescript
// Minimal error scenario testing
test('returns error', () => {
  const response = POST()
  expect(response.status).toBe(500)
})
```

### AFTER: Comprehensive Testing

```typescript
describe('Conductor API Error Handling', () => {
  test('returns 400 for validation error', async () => {
    const response = await POST(invalidRequest)
    const json = await response.json()
    
    expect(response.status).toBe(400)
    expect(json.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(json.requestId).toBeTruthy()
    expect(json.details).toBeDefined()
  })

  test('includes correlation ID in error', async () => {
    const request = newRequest()
    request.headers.set('x-correlation-id', 'test-123')
    
    const response = await POST(request)
    const json = await response.json()
    
    expect(json.requestId).toBe('test-123')
  })

  test('handles missing file gracefully', async () => {
    // Mock file not found
    const response = await POST(request)
    
    expect(response.status).toBe(200) // Graceful degradation
    const json = await response.json()
    expect(json.data).toEqual({ logs: [] })
  })

  test('logs errors with full context', async () => {
    const spy = vi.spyOn(logger, 'error')
    
    await POST(invalidRequest)
    
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Error),
      expect.objectContaining({
        requestId: expect.any(String),
        operation: expect.any(String),
      })
    )
  })

  test('never exposes sensitive data', async () => {
    // Ensure error messages don't contain paths, credentials, etc
    const response = await POST(badRequest)
    const json = await response.json()
    
    expect(json.error).not.toContain('/var')
    expect(json.error).not.toContain('password')
    expect(json.error).not.toContain('mongodb://')
  })
})
```

---

## Deployment Checklist

- [ ] Error handling utilities deployed
- [ ] Route guard pattern implemented
- [ ] All console.log/console.error removed
- [ ] Correlation ID extraction added to all routes
- [ ] Structured logging with context added
- [ ] Error response format standardized
- [ ] HTTP status codes verified
- [ ] Security implications reviewed
- [ ] Test coverage ≥ 80% for error paths
- [ ] Monitoring dashboards updated
- [ ] On-call documentation updated
- [ ] Rollback plan prepared

---

## Rollback Procedure

If issues arise:

1. **Immediate:** Roll back to previous deployment
2. **Investigation:** Check error logs for patterns
3. **Fix:** Address specific issues found
4. **Re-test:** Run full error handling test suite
5. **Re-deploy:** Staged rollout with monitoring

---

## Success Metrics

After implementation, verify:

- ✅ 100% of API errors return structured responses with error codes
- ✅ 100% of errors include correlation IDs for tracing
- ✅ 100% of logging includes request context
- ✅ 0% console.log/console.error in production code
- ✅ 80%+ test coverage for error scenarios
- ✅ 0 security incidents from information disclosure
- ✅ <100ms p95 error handling latency
- ✅ <5 minutes to diagnose any error from logs

