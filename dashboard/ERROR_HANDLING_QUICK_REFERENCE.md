# Error Handling Quick Reference

**Short form guide for developers implementing error handling across all 8 API endpoints.**

---

## 1. Setup (5 minutes)

```typescript
// ✅ Import enhanced error handling v2
import {
  extractCorrelationFromRequest,
  createErrorResponse,
  createSuccessResponse,
  handleRouteError,
  EXTENDED_ERROR_CODES,
  parseValidationErrors,
} from '@/lib/error-handling-v2'

// ✅ Extract request ID
const requestId = extractCorrelationFromRequest(request.headers)

// ✅ Include in responses
response.headers.set('x-correlation-id', requestId)
```

---

## 2. Error Codes Cheat Sheet

| HTTP | Code | Use Case |
|------|------|----------|
| **400** | `VALIDATION_ERROR` | Schema validation failed |
| **400** | `MISSING_REQUIRED_FIELD` | Required field missing |
| **400** | `INVALID_FORMAT` | Email/date/etc invalid |
| **400** | `INVALID_INPUT` | Malformed JSON/syntax |
| **401** | `AUTH_MISSING` | No token provided |
| **401** | `AUTH_EXPIRED` | Token expired |
| **403** | `AUTH_INSUFFICIENT_PERMISSIONS` | User lacks permissions |
| **404** | `RESOURCE_NOT_FOUND` | Resource doesn't exist |
| **409** | `RESOURCE_CONFLICT` | Resource already exists |
| **429** | `RATE_LIMIT_EXCEEDED` | Too many requests |
| **500** | `INTERNAL_ERROR` | Unexpected error |
| **500** | `DATABASE_ERROR` | DB operation failed |
| **502** | `EXTERNAL_SERVICE_ERROR` | API call failed |
| **503** | `SERVICE_UNAVAILABLE` | Service down |
| **504** | `GATEWAY_TIMEOUT` | Request timeout |

---

## 3. Common Patterns

### Validation Error
```typescript
const validation = schema.safeParse(body)
if (!validation.success) {
  return createErrorResponse(
    'Validation failed',
    EXTENDED_ERROR_CODES.VALIDATION_ERROR,
    requestId,
    400,
    { validationErrors: parseValidationErrors(validation.error) }
  )
}
```

### Resource Not Found
```typescript
if (!resource) {
  return createErrorResponse(
    'Resource not found',
    EXTENDED_ERROR_CODES.RESOURCE_NOT_FOUND,
    requestId,
    404
  )
}
```

### Database Error with Retry
```typescript
try {
  const result = await retryWithBackoff(
    () => database.operation(),
    { maxRetries: 3, delayMs: 100, backoff: 'exponential' }
  )
} catch (error) {
  const { response } = handleRouteError(error, requestId, {
    method: 'POST',
    path: '/api/resource',
  })
  return response
}
```

### Bulk Operations
```typescript
const successful = []
const failed = []

for (let i = 0; i < items.length; i++) {
  try {
    successful.push(await process(items[i]))
  } catch (error) {
    failed.push({ index: i, error: error.message })
  }
}

return createBulkOperationResponse(successful, failed, requestId)
```

---

## 4. HTTP Status Codes

```
2xx Success
  ├─ 200 OK (GET, POST success)
  ├─ 201 Created (POST created resource)
  ├─ 204 No Content (DELETE success)
  └─ 207 Multi-Status (bulk partial success)

4xx Client Error
  ├─ 400 Bad Request (validation, invalid input)
  ├─ 401 Unauthorized (missing/invalid auth)
  ├─ 403 Forbidden (insufficient permissions)
  ├─ 404 Not Found (resource not found)
  ├─ 405 Method Not Allowed
  ├─ 409 Conflict (duplicate, conflict)
  ├─ 410 Gone (resource deleted)
  ├─ 413 Payload Too Large
  ├─ 415 Unsupported Media Type
  └─ 429 Too Many Requests

5xx Server Error
  ├─ 500 Internal Server Error
  ├─ 502 Bad Gateway (external service error)
  ├─ 503 Service Unavailable
  └─ 504 Gateway Timeout
```

---

## 5. Response Format

### Success Response
```json
{
  "success": true,
  "data": { /* resource */ },
  "requestId": "1698765432000-a1b2c3d4",
  "timestamp": "2024-10-22T12:00:00Z",
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 10
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "User-friendly message",
  "code": "VALIDATION_ERROR",
  "requestId": "1698765432000-a1b2c3d4",
  "timestamp": "2024-10-22T12:00:00Z",
  "validationErrors": [
    {
      "field": "email",
      "message": "Invalid email",
      "constraint": "email"
    }
  ],
  "retryable": false,
  "retryAfterSeconds": 3
}
```

---

## 6. Endpoint Checklist

For each endpoint (alerts, brain, conductor, etc):

- [ ] Extract correlation ID from headers
- [ ] Validate input with schema
- [ ] Return validation errors with details
- [ ] Handle database errors with retry
- [ ] Handle external service with circuit breaker
- [ ] Use correct error codes
- [ ] Include correlation ID in responses
- [ ] Log with context
- [ ] Return correct HTTP status codes
- [ ] Test all error paths

---

## 7. Testing Examples

```typescript
// Test validation error
test('returns 400 on validation error', async () => {
  const res = await POST(createRequest({}), userId)
  expect(res.status).toBe(400)
  expect(res.data.code).toBe('VALIDATION_ERROR')
})

// Test not found
test('returns 404 when resource not found', async () => {
  const res = await GET(createRequest('?id=nonexistent'), userId)
  expect(res.status).toBe(404)
  expect(res.data.code).toBe('RESOURCE_NOT_FOUND')
})

// Test retry
test('retries on transient error', async () => {
  let attempts = 0
  const op = async () => {
    attempts++
    if (attempts < 3) throw new Error('Transient')
    return 'success'
  }
  
  const result = await retryWithBackoff(op)
  expect(result).toBe('success')
  expect(attempts).toBe(3)
})
```

---

## 8. Common Mistakes to Avoid

### ❌ Wrong: Using old error handling
```typescript
import { createErrorResponse } from '@/lib/error-handling'
// ❌ Wrong version
```

### ✅ Right: Using v2
```typescript
import { createErrorResponse } from '@/lib/error-handling-v2'
// ✅ Correct version
```

### ❌ Wrong: String error codes
```typescript
return createErrorResponse('Error', 'VALIDATION_ERROR', id, 400)
// ❌ Not type-safe
```

### ✅ Right: Typed error codes
```typescript
return createErrorResponse(
  'Error',
  EXTENDED_ERROR_CODES.VALIDATION_ERROR,
  id,
  400
)
// ✅ Type-safe, autocomplete
```

### ❌ Wrong: Exposing internal errors in production
```typescript
return NextResponse.json(
  { error: 'Database connection string is invalid' },
  { status: 500 }
)
// ❌ Information disclosure
```

### ✅ Right: Safe error messages
```typescript
return createErrorResponse(
  'Database operation failed',
  EXTENDED_ERROR_CODES.DATABASE_ERROR,
  requestId,
  500
)
// ✅ Generic, safe message
```

### ❌ Wrong: Forgetting correlation ID
```typescript
const response = NextResponse.json(data)
return response
// ❌ No correlation ID
```

### ✅ Right: Include correlation ID
```typescript
const response = NextResponse.json(data)
response.headers.set('x-correlation-id', requestId)
return response
// ✅ Enables request tracing
```

---

## 9. Files Reference

| File | Purpose |
|------|---------|
| `lib/error-handling-v2.ts` | Implementation |
| `lib/error-handling-v2.test.ts` | Tests |
| `ERROR_HANDLING_MIGRATION_GUIDE.md` | Detailed guide |
| `ERROR_HANDLING_ROUTE_TEMPLATE.md` | Complete example |
| `ERROR_HANDLING_IMPLEMENTATION_SUMMARY.md` | Overview |
| `ERROR_HANDLING_QUICK_REFERENCE.md` | This file |

---

## 10. Getting Started (15 minutes)

1. **Read migration guide** (5 min)
   ```bash
   cat ERROR_HANDLING_MIGRATION_GUIDE.md
   ```

2. **Review route template** (5 min)
   ```bash
   cat ERROR_HANDLING_ROUTE_TEMPLATE.md | head -200
   ```

3. **Update your first route** (5 min)
   - Copy GET/POST pattern from template
   - Update imports
   - Test with curl

4. **Run tests** (optional)
   ```bash
   npm test lib/error-handling-v2.test.ts
   ```

---

## 11. Deploy Checklist

Before deploying to production:

```bash
# ✅ Run tests
npm test lib/error-handling-v2.test.ts

# ✅ Check coverage (should be 85%+)
npm test -- --coverage lib/error-handling-v2

# ✅ Build
npm run build

# ✅ Type check
tsc --noEmit

# ✅ Test one endpoint manually
curl -X POST http://localhost:3000/api/alerts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

---

## 12. Monitoring in Production

Watch for in logs:

```bash
# Validation errors (should be low)
grep "VALIDATION_ERROR" logs/error.log | wc -l

# Database errors (track trends)
grep "DATABASE_ERROR" logs/error.log | wc -l

# External service errors (alert if >5%)
grep "EXTERNAL_SERVICE_ERROR" logs/error.log | wc -l

# Circuit breaker state
grep "Circuit breaker" logs/error.log

# Correlation ID usage (for tracing)
grep "requestId" logs/error.log | head -5
```

---

## 13. Need Help?

**Q: Which error code should I use?**  
A: See section 2 (Error Codes Cheat Sheet) above

**Q: How do I handle validation errors?**  
A: See section 3 (Common Patterns) - Validation Error example

**Q: How do I retry failed operations?**  
A: Use `retryWithBackoff()` - see section 3

**Q: Do I need to implement circuit breaker?**  
A: Only for external API calls. See template for example

**Q: How do I test my implementation?**  
A: Follow section 7 (Testing Examples)

**Q: What's the status code for...?**  
A: See section 4 (HTTP Status Codes) or section 2

**Q: Can I modify error codes?**  
A: Add new codes to `EXTENDED_ERROR_CODES` in v2 file

---

## 14. Feedback Loop

Found a bug? Need a new error code? Have suggestions?

1. Create new error code in `EXTENDED_ERROR_CODES`
2. Add to status mapping in `getHttpStatus()`
3. Add test cases in test suite
4. Document in migration guide
5. Push to main branch

---

**Print this page or bookmark it while implementing error handling across all endpoints.**

**Last Updated:** October 22, 2026  
**Version:** 2.0  
**Status:** Production Ready
