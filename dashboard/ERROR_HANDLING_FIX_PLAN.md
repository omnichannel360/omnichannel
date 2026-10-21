# Comprehensive Error Handling Improvement Plan
**Status**: Active Implementation | **Priority**: Critical | **Scope**: All 11 API Routes

## Executive Summary
Error handling is **inconsistent across APIs**, causing:
- Generic error messages hiding root causes
- Inconsistent logging (some use console.log)
- Missing operational error classification
- No timeout/connection error handling
- Security info leakage in error responses
- Difficult debugging for API consumers

## Issues Identified

### Per-Route Assessment

| Route | Issue | Severity | Fix |
|-------|-------|----------|-----|
| **conductor** | Uses console.error/debug instead of logger | HIGH | Replace with logger.error/warn |
| **meetings** | No logger import, generic errors, no error classification | HIGH | Add logger, structured errors, use ERROR_CODES |
| **brain** | Generic "Failed to query brain" message, missing context | MEDIUM | Add operation type, error classification, context |
| **kanban** | Missing verifyAuth import, inconsistent error handling | MEDIUM | Add import, standardize error patterns |
| **auth** | Basic error handling, exposes token generation errors | MEDIUM | Sanitize errors, add error classification |
| **metrics** | Good foundation but missing error classification | LOW | Add ERROR_CODES usage |
| **profiles** | No error context, missing correlation ID | MEDIUM | Add correlationId, structured errors |
| **alerts** | Good foundation but missing error classification | LOW | Add ERROR_CODES usage |
| **health** | Good but missing operational error handling | LOW | Add timeout handling, connection errors |

## Root Causes

1. **No Centralized Error Classification**
   - Routes don't use ERROR_CODES consistently
   - No distinction between client (4xx) and server (5xx) errors
   - Operational errors (timeout, connection) not handled

2. **Logging Inconsistency**
   - conductor uses console.log (violations)
   - Some routes missing logger imports
   - No standardized context attachment

3. **Generic Error Messages**
   - "Failed to X" messages hide actual problems
   - No user-facing vs internal error messages
   - Security: exposes internal details sometimes

4. **Missing Error Context**
   - requestId/correlationId not attached to all errors
   - No operation type in logging
   - Response time not included in all paths

5. **No Operational Error Handling**
   - Timeout errors not distinguished (503 vs 500)
   - Connection errors not handled
   - JSON parse errors not uniformly handled

## Solution Architecture

### 1. Unified Error Handling Utility

Create a comprehensive error handler that:
- Classifies errors (client/server/operational)
- Sanitizes responses (no internal details)
- Attaches full context (requestId, operation, timing)
- Uses ERROR_CODES consistently
- Returns appropriate HTTP status codes

### 2. Standard Error Response Format

```typescript
{
  success: false
  error: "User-facing message"
  code: "ERROR_CODE_CONSTANT"
  requestId: "correlation-id"
  timestamp: "ISO-8601"
  details?: { /* Safe context for debugging */ }
}
```

### 3. Error Classification

- **Client Errors (4xx)**
  - VALIDATION_ERROR (400)
  - RESOURCE_NOT_FOUND (404)
  - CONFLICT (409)

- **Server Errors (5xx)**
  - INTERNAL_ERROR (500)
  - SERVICE_UNAVAILABLE (503)

- **Operational Errors**
  - Timeout → 503 SERVICE_UNAVAILABLE
  - Connection → 503 SERVICE_UNAVAILABLE
  - JSON Parse → 400 INVALID_INPUT

### 4. Error Response Middleware

Standard try-catch pattern across all routes:

```typescript
const startTime = Date.now()
const correlationId = getOrCreateCorrelationId(request.headers)
const logContext = createLogContext({
  method: request.method,
  path: request.nextUrl.pathname,
  operation: 'specific_operation',
  correlationId
})

try {
  // Handler logic
  return successResponse
} catch (error) {
  const { response, statusCode } = handleRouteError(error, correlationId, logContext)
  logger.error('Operation failed', error, {
    ...logContext,
    statusCode,
    responseTimeMs: Date.now() - startTime
  })
  return response
}
```

## Implementation Steps

### Phase 1: Foundation (TODAY)
1. ✅ Verify error-handling.ts has all needed utilities
2. ✅ Create comprehensive error classification system
3. ✅ Update conductor (console.log removal)
4. ✅ Update meetings (add logger, standardize errors)

### Phase 2: Core APIs (TODAY)
5. ✅ Update brain, kanban, auth
6. ✅ Add missing imports across routes

### Phase 3: Remaining Routes (TODAY)
7. ✅ Update metrics, profiles, alerts, health
8. ✅ Verify all routes use consistent patterns

### Phase 4: Testing (TODAY)
9. ✅ Create error scenario tests
10. ✅ Verify error codes match HTTP statuses
11. ✅ Test timeout/connection handling

### Phase 5: Verification (TODAY)
12. ✅ Code review all changes
13. ✅ Run integration tests
14. ✅ Verify logging is consistent

## Success Criteria

- [ ] All routes use logger, never console.log
- [ ] All errors return structured format with requestId
- [ ] All errors classified with ERROR_CODES
- [ ] Client errors (4xx), Server errors (5xx) properly mapped
- [ ] Operational errors handled (timeout → 503, connection → 503)
- [ ] Error messages user-friendly, no internal details exposed
- [ ] All errors logged with full context (method, path, operation, timing)
- [ ] 80%+ test coverage for error paths
- [ ] No generic "Failed to X" messages remain

## Files to Modify

1. `dashboard/app/api/conductor/route.ts` - Replace console.log with logger
2. `dashboard/app/api/meetings/route.ts` - Add logger, ERROR_CODES, structured errors
3. `dashboard/app/api/brain/route.ts` - Add correlationId, ERROR_CODES
4. `dashboard/app/api/kanban/route.ts` - Add missing verifyAuth, standardize
5. `dashboard/app/api/auth/route.ts` - Add ERROR_CODES, sanitize errors
6. `dashboard/app/api/metrics/route.ts` - Add ERROR_CODES
7. `dashboard/app/api/profiles/route.ts` - Add correlationId, ERROR_CODES
8. `dashboard/app/api/alerts/route.ts` - Add ERROR_CODES
9. `dashboard/app/api/health/route.ts` - Add operational error handling

## Error Codes Reference

```
AUTH_MISSING, AUTH_INVALID, AUTH_EXPIRED, INSUFFICIENT_PERMISSIONS
VALIDATION_ERROR, INVALID_INPUT
RATE_LIMIT_EXCEEDED
INTERNAL_ERROR, SERVICE_UNAVAILABLE, NOT_FOUND
RESOURCE_NOT_FOUND, CONFLICT
```

## Testing Strategy

For each route:
1. Test happy path (200/201)
2. Test validation failure (400)
3. Test auth failure (401)
4. Test not found (404)
5. Test conflict (409)
6. Test timeout (503)
7. Verify correlationId in response
8. Verify ERROR_CODE in response
9. Verify logger called with context

## Next Steps

1. Create helper utility for standard error handling wrapper
2. Apply to conductor (highest priority - console.log violation)
3. Apply to meetings (second priority - missing logger)
4. Apply systematically to remaining routes
5. Create integration tests for error scenarios
6. Run full test suite and verify coverage
