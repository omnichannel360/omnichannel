# Input Validation - Complete Implementation Guide

## Overview

This document provides a comprehensive guide for the input validation system implemented across all API routes in the OmniCompany dashboard.

## Architecture

### 1. Validation Layers

```
Client Request
    ↓
[Header Validation] - Content-Type, size limits
    ↓
[Request Size Validation] - Max body/query size
    ↓
[Schema Validation] - Zod schemas for structure
    ↓
[Security Validation] - XSS, SQL injection detection
    ↓
Business Logic
```

### 2. Core Components

#### A. Middleware (`dashboard/lib/validation/middleware.ts`)
- **Header Validation**: Ensures valid Content-Type headers
- **Size Validation**: Enforces request and query size limits
- **Error Formatting**: Standardizes validation error responses

#### B. Schemas (`dashboard/lib/validation/schemas.ts`)
- **Zod-based schemas** for all API inputs
- **Type-safe inference** using `z.infer<typeof Schema>`
- **Comprehensive coverage** of all endpoints

#### C. Helper Functions (`dashboard/lib/input-validation.ts`)
- **Sanitization**: XSS prevention
- **SQL Injection Detection**: Pattern matching
- **File Name Sanitization**: Directory traversal prevention
- **URL Validation**: Protocol and format validation

### 3. Configuration Limits

```typescript
// Request size limits
MAX_BODY_SIZE = 1MB
MAX_QUERY_SIZE = 10KB
MAX_HEADER_SIZE = 8KB

// Content validation
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
EMAIL_MAX_LENGTH = 254
STRING_MAX_LENGTH = 10,000
LIMIT_MAX = 1,000
```

## Implementation Examples

### Example 1: POST Endpoint with Body Validation

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateBody } from '@/lib/validation/middleware'
import { LoginRequestSchema, type LoginRequest } from '@/lib/validation/schemas'

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const bodyResult = await validateBody<LoginRequest>(request, LoginRequestSchema)
    if (!bodyResult.success) {
      return bodyResult.response // Returns 400 with validation errors
    }

    const { email, password } = bodyResult.data

    // Process validated data...
    
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    // Error handling
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### Example 2: GET Endpoint with Query Validation

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateQuery } from '@/lib/validation/middleware'
import { MetricsQuerySchema, type MetricsQuery } from '@/lib/validation/schemas'

export async function GET(request: NextRequest) {
  try {
    // Validate query parameters
    const queryResult = await validateQuery<MetricsQuery>(request, MetricsQuerySchema)
    if (!queryResult.success) {
      return queryResult.response // Returns 400 with validation errors
    }

    const { period, format } = queryResult.data

    // Process validated query params...
    
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    // Error handling
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### Example 3: Using Security Helpers

```typescript
import { sanitizeString, detectSqlInjection } from '@/lib/input-validation'

// Prevent XSS
const userInput = '<script>alert("xss")</script>'
const safe = sanitizeString(userInput) // Outputs: &lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;

// Detect SQL injection
if (detectSqlInjection(searchQuery)) {
  return NextResponse.json(
    { error: 'Invalid input' },
    { status: 400 }
  )
}
```

## API Routes Implementation Status

### ✅ Implemented & Protected

#### 1. `/api/auth/login` (POST)
- **Validation**: Email, password (LoginRequestSchema)
- **Security**: Rate limiting (5 requests per minute)
- **Headers**: Content-Type validation
- **Status**: ✅ Complete

#### 2. `/api/auth` (POST)
- **Validation**: User ID, email, role (TokenGenerationSchema)
- **Security**: Rate limiting, header validation
- **Size Limits**: 1MB body, 10KB query
- **Status**: ✅ Complete

#### 3. `/api/brain` (GET)
- **Validation**: Category, limit (BrainQuerySchema)
- **Security**: Auth verification, query size validation
- **Rate Limiting**: Applied
- **Logging**: Comprehensive error logging (replaced console.error with logger)
- **Status**: ✅ Complete with fixes

#### 4. `/api/metrics` (GET)
- **Validation**: Period, format (MetricsQuerySchema)
- **Security**: Auth verification, rate limiting
- **Response**: Consistent JSON format
- **Status**: ✅ Complete

## Testing

### Unit Tests

Run validation tests:
```bash
npm test -- validation
```

**Test Coverage:**
- Email validation (RFC 5322 compliance)
- Password strength (uppercase, lowercase, numbers, special chars)
- XSS pattern detection
- SQL injection pattern detection
- File name sanitization
- URL validation
- Pagination constraints
- Type coercion (string → number)

### Integration Tests

Test actual API endpoints:
```bash
npm run test:integration -- api/auth/login
```

## Security Guidelines

### 1. Always Validate at Boundaries
```typescript
// ✅ GOOD - Validate all external inputs
const result = await validateBody(request, schema)

// ❌ BAD - Using unvalidated input
const email = await request.json().then(b => b.email)
```

### 2. Use Type-Safe Schemas
```typescript
// ✅ GOOD - Type-safe with Zod inference
const data = await validateBody<LoginRequest>(request, LoginRequestSchema)
const email: string = data.data.email

// ❌ BAD - Unsafe type casting
const email = (await request.json()).email as string
```

### 3. Sanitize Before Storage
```typescript
// ✅ GOOD - Sanitize user input before database
const safe = sanitizeString(userInput)
await db.insert({ content: safe })

// ❌ BAD - Store unsanitized input
await db.insert({ content: userInput })
```

### 4. Detect Injection Attempts
```typescript
// ✅ GOOD - Check for injection patterns
if (detectSqlInjection(searchQuery)) {
  return error400()
}

// ❌ BAD - Skip injection detection
const results = db.query(`SELECT * FROM users WHERE name = '${searchQuery}'`)
```

## Error Responses

### Validation Error Response
```json
{
  "success": false,
  "error": "Request validation failed",
  "validationErrors": [
    {
      "field": "email",
      "message": "Invalid email format",
      "code": "invalid_string"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 characters",
      "code": "too_small"
    }
  ],
  "timestamp": "2024-10-22T12:00:00Z"
}
```

### Request Size Exceeded
```json
{
  "success": false,
  "error": "Request body too large: 2097152 bytes (max: 1048576 bytes)",
  "timestamp": "2024-10-22T12:00:00Z"
}
```

Status Code: **413 Payload Too Large**

### Invalid Headers
```json
{
  "success": false,
  "error": "Invalid Content-Type: application/xml. Expected application/json",
  "timestamp": "2024-10-22T12:00:00Z"
}
```

Status Code: **400 Bad Request**

## Rate Limiting

Rate limits are enforced per endpoint:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/login` | 5 requests | 1 minute |
| `/api/auth` | 10 requests | 1 minute |
| `/api/brain` | 20 requests | 1 minute |
| `/api/metrics` | 20 requests | 1 minute |

**Headers in Response:**
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1729604460
```

## Logging

All validation events are logged with comprehensive context:

```typescript
// Successful validation
logger.info('Query validation succeeded', {
  path: '/api/metrics',
  method: 'GET',
  userId: 'user123',
  statusCode: 200,
})

// Validation failure
logger.warn('Request validation failed', {
  path: '/api/auth/login',
  method: 'POST',
  errors: [{ field: 'email', message: 'Invalid email format' }],
  statusCode: 400,
})

// Security concern
logger.warn('Potential SQL injection attempt detected', {
  path: '/api/search',
  input: 'malicious query',
  operation: 'query_validation',
})
```

## Troubleshooting

### Issue: "Invalid Content-Type" Error

**Cause**: Request missing or incorrect Content-Type header

**Solution**:
```typescript
// Add header to request
fetch('/api/auth', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json' // Required!
  },
  body: JSON.stringify({ email: 'user@example.com', password: 'pass' })
})
```

### Issue: "Request body too large"

**Cause**: Payload exceeds 1MB limit

**Solution**:
- Check for unnecessary data in request
- Stream large payloads
- Contact admin to adjust limits if legitimate

### Issue: "Validation failed" with no specific field

**Cause**: Request body parsing error (malformed JSON)

**Solution**:
```typescript
// ✅ GOOD - Valid JSON
{ "email": "user@example.com" }

// ❌ BAD - Invalid JSON
{ email: "user@example.com" }
```

## Maintenance

### Adding New Endpoints

1. **Define Schema** in `dashboard/lib/validation/schemas.ts`:
```typescript
export const MyEndpointSchema = z.object({
  field: z.string().min(1),
})
```

2. **Use in Route**:
```typescript
const result = await validateBody(request, MyEndpointSchema)
if (!result.success) return result.response
```

3. **Add Tests** in `*.test.ts`

### Updating Validation Rules

1. Update schema in `schemas.ts`
2. Update middleware if needed
3. Run tests: `npm test -- validation`
4. Update this guide
5. Commit with message: `feat: Update validation rules for X`

## Summary of Changes

### Files Modified:
- ✅ `dashboard/lib/validation/middleware.ts` - Added header/size validation
- ✅ `dashboard/app/api/brain/route.ts` - Fixed console.error logging
- ✅ `dashboard/lib/input-validation.ts` - Enhanced security functions
- ✅ `dashboard/lib/validation/schemas.ts` - Strong password requirements

### Test Coverage:
- ✅ `dashboard/lib/validation/middleware.test.ts` - 30+ test cases
- ✅ `dashboard/lib/validation/schemas.test.ts` - 50+ test cases

### Security Enhancements:
- Header validation (Content-Type)
- Request size limits (1MB body, 10KB query)
- XSS pattern detection
- SQL injection detection
- File name sanitization
- URL validation

## Next Steps

1. **Run test suite**: `npm test -- validation`
2. **Review logs**: Check `/var/log/dashboard/` for validation events
3. **Monitor rate limits**: Check headers in responses
4. **Adjust limits**: Update config if needed based on usage patterns
5. **Extend validation**: Add schemas for new endpoints following this pattern
