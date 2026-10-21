# API Endpoint Error Handling Refactoring Guide

## Quick Reference: Apply to All 11 Endpoints

### Template Pattern

Every API endpoint should follow this structure for unified error handling:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import {
  extractCorrelationFromRequest,
  createSuccessResponse,
  handleRouteError,
  formatErrorLog,
  withTimeout,
} from '@/lib/error-handling'
import { createLogContext, logger } from '@/lib/logger'
import { protectRouteMulti } from '@/lib/protected-route'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'

const handlers = protectRouteMulti(
  {
    GET: async (request: NextRequest, { userId }) => {
      const requestId = extractCorrelationFromRequest(request.headers)
      const startTime = Date.now()

      // 1. Apply rate limiting
      const rateLimitError = await applyRateLimit(request, 'endpoint-name')
      if (rateLimitError) return rateLimitError

      const logContext = createLogContext({
        method: request.method,
        path: request.nextUrl.pathname,
        userId,
        operation: 'operation_name',
        requestId,
      })

      try {
        // 2. Main operation with timeout protection (30s default)
        const result = await withTimeout(
          performOperation(),
          30000,
          'Operation timeout'
        )

        const responseTime = Date.now() - startTime

        // 3. Success logging
        logger.info('Operation successful', {
          ...logContext,
          statusCode: 200,
          responseTimeMs: responseTime,
        })

        // 4. Success response with correlation ID
        const response = NextResponse.json(
          createSuccessResponse(result, requestId)
        )
        response.headers.set('x-correlation-id', requestId)
        return response
      } catch (error) {
        const responseTime = Date.now() - startTime

        // 5. Error handling and response
        const { response, statusCode } = handleRouteError(error, requestId, {
          method: request.method,
          path: request.nextUrl.pathname,
          userId,
          operation: 'operation_name',
        })

        // 6. Error logging with context
        logger.error(
          'Operation failed',
          error,
          formatErrorLog('Operation error', error, {
            ...logContext,
            statusCode,
            responseTimeMs: responseTime,
          })
        )

        response.headers.set('x-correlation-id', requestId)
        return response
      }
    },

    POST: async (request: NextRequest, { userId }) => {
      const requestId = extractCorrelationFromRequest(request.headers)
      const startTime = Date.now()

      // Apply rate limiting
      const rateLimitError = await applyRateLimit(request, 'endpoint-name')
      if (rateLimitError) return rateLimitError

      const logContext = createLogContext({
        method: request.method,
        path: request.nextUrl.pathname,
        userId,
        operation: 'create_operation',
        requestId,
      })

      try {
        // Validate request body with enhanced error details
        const bodyResult = await validateBody<RequestType>(request, RequestSchema)
        if (!bodyResult.success) {
          const response = bodyResult.response?.clone() || new NextResponse()
          response.headers.set('x-correlation-id', requestId)
          return response
        }

        // Create resource with timeout
        const result = await withTimeout(
          createResource(bodyResult.data),
          30000,
          'Create timeout'
        )

        const responseTime = Date.now() - startTime
        logger.info('Resource created', {
          ...logContext,
          statusCode: 201,
          responseTimeMs: responseTime,
          resourceId: result.id,
        })

        const response = NextResponse.json(
          createSuccessResponse(result, requestId),
          { status: 201 }
        )
        response.headers.set('x-correlation-id', requestId)
        return response
      } catch (error) {
        const responseTime = Date.now() - startTime
        const { response, statusCode } = handleRouteError(error, requestId, {
          method: request.method,
          path: request.nextUrl.pathname,
          userId,
          operation: 'create_operation',
        })

        logger.error(
          'Create failed',
          error,
          formatErrorLog('Create error', error, {
            ...logContext,
            statusCode,
            responseTimeMs: responseTime,
          })
        )

        response.headers.set('x-correlation-id', requestId)
        return response
      }
    },
  },
  { requireAuth: true, rateLimitKey: 'endpoint-name' }
)

export const { GET, POST } = handlers
```

---

## Routes to Update (11 total)

### Checklist with Specifics

#### 1. ✅ `/api/alerts` - COMPLETED
- Status: Enhanced with timeout
- Changes: Added `withTimeout` to GET handler
- Test: Already has tests, need to add timeout test

#### 2. `/api/brain`
**File**: `dashboard/app/api/brain/route.ts`

Changes needed:
- [ ] Add `withTimeout` wrapper (consider 60s for brain operations)
- [ ] Add `sanitizeErrorDetails` before logging
- [ ] Add response time logging
- [ ] Ensure correlation ID propagation in all responses

**Timeout**: 60s (brain operations may be slow)

#### 3. `/api/conductor`
**File**: `dashboard/app/api/conductor/route.ts`

Changes needed:
- [ ] Add `withTimeout` wrapper
- [ ] Add error details sanitization
- [ ] Ensure all endpoints have response time tracking
- [ ] Add circuit breaker for external service calls (if applicable)

**Timeout**: 45s

#### 4. `/api/health`
**File**: `dashboard/app/api/health/route.ts`

Changes needed:
- [ ] Should be fast - use 5s timeout
- [ ] Check multiple health indicators with individual timeouts
- [ ] Aggregate health check results

**Timeout**: 5s (health should be fast)

#### 5. `/api/kanban`
**File**: `dashboard/app/api/kanban/route.ts`

Changes needed:
- [ ] Add `withTimeout` for board operations
- [ ] Sanitize column/card details before logging
- [ ] Handle bulk operations safely

**Timeout**: 30s

#### 6. `/api/meetings`
**File**: `dashboard/app/api/meetings/route.ts`

Changes needed:
- [ ] Add `withTimeout` for meeting operations
- [ ] Sanitize participant data before logging
- [ ] Handle calendar integration errors

**Timeout**: 30s

#### 7. `/api/metrics`
**File**: `dashboard/app/api/metrics/route.ts`

Changes needed:
- [ ] Add `withTimeout` for metric queries
- [ ] Handle aggregation timeouts
- [ ] Add response time logging

**Timeout**: 45s (queries might be complex)

#### 8. `/api/auth`
**File**: `dashboard/app/api/auth/route.ts`

Changes needed:
- [ ] Add `withTimeout` for auth operations
- [ ] **CRITICAL**: Never expose auth details in errors
- [ ] Sanitize error responses completely

**Timeout**: 10s (auth should be quick)

#### 9. `/api/auth/login`
**File**: `dashboard/app/api/auth/login/route.ts`

Changes needed:
- [ ] Add `withTimeout` for login flow
- [ ] **CRITICAL**: Don't reveal if user exists
- [ ] Rate limit aggressively for failed attempts
- [ ] Sanitize all user identifiable data

**Timeout**: 10s

#### 10. `/api/auth/verify`
**File**: `dashboard/app/api/auth/verify/route.ts`

Changes needed:
- [ ] Add `withTimeout` for token verification
- [ ] Handle expired tokens gracefully
- [ ] Sanitize token details

**Timeout**: 5s

#### 11. `/api/profiles`
**File**: `dashboard/app/api/profiles/route.ts`

Changes needed:
- [ ] Add `withTimeout` for profile operations
- [ ] Sanitize personal data before logging
- [ ] Handle profile update conflicts

**Timeout**: 30s

---

## Implementation Steps

### Step 1: Update Error Handling Imports (All Routes)

```typescript
// BEFORE
import { extractCorrelationFromRequest, createSuccessResponse } from '@/lib/error-handling'

// AFTER
import {
  extractCorrelationFromRequest,
  createSuccessResponse,
  handleRouteError,
  formatErrorLog,
  withTimeout,
  sanitizeErrorDetails,
} from '@/lib/error-handling'
```

### Step 2: Add Rate Limiting (Already Present - Verify)

```typescript
const rateLimitError = await applyRateLimit(request, 'endpoint-name')
if (rateLimitError) return rateLimitError
```

### Step 3: Wrap Main Operations with Timeout

```typescript
// BEFORE
const data = await fetchData()

// AFTER
const data = await withTimeout(
  fetchData(),
  30000, // timeout in ms
  'Operation timeout message'
)
```

### Step 4: Add Enhanced Error Logging

```typescript
logger.error(
  'Operation failed',
  error,
  formatErrorLog('Error context', error, {
    ...logContext,
    statusCode,
    responseTimeMs: responseTime,
  })
)
```

### Step 5: Ensure Correlation ID on All Responses

```typescript
response.headers.set('x-correlation-id', requestId)
```

---

## Testing Checklist

For each endpoint:

- [ ] **Happy Path**: Normal operation succeeds
- [ ] **Timeout**: Operation exceeds timeout (should return 504)
- [ ] **Validation**: Invalid input rejected (should return 400)
- [ ] **Auth**: Missing/invalid auth returns 401
- [ ] **Rate Limit**: Exceeding limit returns 429
- [ ] **Server Error**: 500 errors don't leak stack traces
- [ ] **Correlation**: ID propagates through entire request
- [ ] **Response Time**: Logged correctly
- [ ] **Error Details**: Sensitive data sanitized

### Test Template

```typescript
describe('POST /api/endpoint', () => {
  it('should timeout after 30 seconds', async () => {
    // Mock slow operation
    const response = await fetch('/api/endpoint', {
      method: 'POST',
      body: JSON.stringify({ slow: true }),
    })
    
    expect(response.status).toBe(504)
    const data = await response.json()
    expect(data.error).toContain('timeout')
  })

  it('should include correlation ID in response', async () => {
    const response = await fetch('/api/endpoint', {
      method: 'GET',
      headers: { 'x-correlation-id': 'test-123' },
    })
    
    expect(response.headers.get('x-correlation-id')).toBe('test-123')
  })

  it('should sanitize error details', async () => {
    // Trigger error with sensitive data
    const response = await fetch('/api/endpoint', {
      method: 'POST',
      body: JSON.stringify({ password: 'secret' }),
    })
    
    const data = await response.json()
    expect(data.error).not.toContain('secret')
  })
})
```

---

## Security Audit Checklist

- [ ] No stack traces in production responses
- [ ] No database error details exposed
- [ ] No user data in error messages
- [ ] No sensitive fields in logs
- [ ] Auth errors don't reveal user existence
- [ ] Password fields sanitized
- [ ] API keys not logged
- [ ] Tokens not exposed in errors
- [ ] Rate limit headers present
- [ ] CORS headers correct

---

## Performance Metrics

After implementation, track:

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| P95 Response Time | - | < 2s | - |
| P99 Response Time | - | < 5s | - |
| Error Rate | - | < 0.1% | - |
| Timeout Rate | - | < 0.01% | - |
| Auth Errors | - | < 1% | - |

---

## Deployment Strategy

1. **Branch**: `fix/error-handling-all-endpoints`
2. **Phase 1**: Core utilities + 1 endpoint (alerts) ✅
3. **Phase 2**: 5 endpoints (brain, conductor, health, kanban, meetings)
4. **Phase 3**: 3 endpoints (metrics, profiles, auth)
5. **Phase 4**: Auth variants (login, verify)
6. **Testing**: Full suite + manual testing
7. **Review**: Security + Performance
8. **Merge**: To main after approval

---

## Rollback Plan

If issues occur:

```bash
# Revert to previous version
git revert HEAD

# Monitor errors
tail -f logs/error.log

# Hotfix if needed
git checkout -b hotfix/error-handling-issue
# Make fixes...
git push
# Create emergency PR
```

---

## Next Steps

1. ✅ Core error handling utilities ready
2. ✅ Comprehensive test suite ready
3. ⏳ Apply template to remaining 10 endpoints
4. ⏳ Run full test suite
5. ⏳ Security audit
6. ⏳ Performance testing
7. ⏳ Deploy to staging
8. ⏳ Production deployment

---

## Questions?

Refer to:
- Error handling patterns: `dashboard/lib/error-handling.ts`
- Test examples: `dashboard/app/api/__tests__/error-handling-comprehensive.test.ts`
- Validation: `dashboard/lib/validation/middleware.ts`
- Logger: `dashboard/lib/logger.ts`
