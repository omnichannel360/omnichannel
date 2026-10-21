# Input Validation Implementation Guide

## Overview

This document describes the comprehensive input validation system implemented across all OmniCompany API endpoints.

**Status:** ✅ COMPLETE - All 11 API routes have validation

## Validation Architecture

### 3-Layer Validation Strategy

1. **Schema Validation** (`/lib/validation/schemas.ts`)
   - Zod-based type-safe schemas
   - Defines allowed values, formats, and constraints
   - Includes default values and transformations

2. **Middleware Validation** (`/lib/validation/middleware.ts`)
   - `validateBody<T>()` - Validates POST/PATCH request bodies
   - `validateQuery<T>()` - Validates GET query parameters
   - Uniform error response formatting
   - Logging of validation failures

3. **Route Implementation** (`/app/api/*/route.ts`)
   - Each endpoint uses middleware before business logic
   - Consistent error handling and logging
   - Rate limiting + validation layering

## API Endpoints - Validation Status

| Endpoint | Method | Body Validation | Query Validation | Status |
|----------|--------|-----------------|------------------|--------|
| `/api/auth/login` | POST | ✅ LoginRequestSchema | N/A | ✅ |
| `/api/auth` | POST | ✅ TokenGenerationSchema | N/A | ✅ |
| `/api/auth/verify` | GET | N/A | N/A | ✅ |
| `/api/brain` | GET | N/A | ✅ BrainQuerySchema | ✅ |
| `/api/metrics` | GET | N/A | ✅ MetricsQuerySchema | ✅ |
| `/api/conductor` | POST | ✅ ConductorRequestSchemaComprehensive | N/A | ✅ |
| `/api/alerts` | GET | N/A | N/A | ✅ |
| `/api/alerts` | POST | ✅ AlertCreateBodySchema | N/A | ✅ |
| `/api/alerts` | PATCH | ✅ AlertUpdateBodySchema | N/A | ✅ |
| `/api/health` | GET | N/A | Optional Query Params | ✅ |
| `/api/kanban` | GET | N/A | N/A | ✅ |
| `/api/kanban` | POST | ✅ KanbanCreateSchema | N/A | ✅ |
| `/api/meetings` | GET | N/A | N/A | ✅ |
| `/api/meetings` | POST | ✅ MeetingCreateSchema | N/A | ✅ |
| `/api/profiles` | GET | N/A | ✅ ProfileQuerySchema | ✅ |

## Validation Rules by Endpoint

### Authentication

#### POST /api/auth/login
```typescript
// Required fields
email: string (valid email format, 3-254 chars)
password: string (6-128 chars, weak validation for dev)

// Normalization
email: converted to lowercase, trimmed
```

#### POST /api/auth
```typescript
// Required fields
userId: string (alphanumeric + _ - , max 100 chars)
email: string (valid email format)

// Optional fields
role: 'user' | 'admin' | 'viewer' (default: 'user')
```

### Data Query

#### GET /api/brain
```typescript
// Query parameters (optional)
category: string (alphanumeric + _ - , max 50 chars, optional)
limit: number (1-100, default: 20)
```

#### GET /api/metrics
```typescript
// Query parameters (optional)
period: 'day' | 'week' | 'month' | 'year' (default: 'day')
format: 'json' | 'csv' (default: 'json')
```

### Alerts Management

#### POST /api/alerts
```typescript
// Required fields
title: string (1-2000 chars, no XSS)
message: string (1-2000 chars, no XSS)

// Optional fields
severity: 'info' | 'warning' | 'error' | 'critical' (default: 'info')
tags: string[] (max 10 tags, max 1000 chars each)
```

#### PATCH /api/alerts
```typescript
// Required fields
alert_id: string (1-100 chars)
status: 'active' | 'resolved'
```

### Task Management

#### POST /api/kanban
```typescript
// Required fields
title: string (1+ chars, max 1000, no XSS)

// Optional fields
description: string (max 1000, no XSS)
status: 'todo' | 'in_progress' | 'done' (default: 'todo')
priority: 'low' | 'medium' | 'high' (default: 'medium')
```

### Meetings

#### POST /api/meetings
```typescript
// Required fields
title: string (1+ chars, max 1000, no XSS)

// Optional fields
description: string (max 1000, no XSS)
startTime: ISO 8601 datetime string
endTime: ISO 8601 datetime string
attendees: email[] (min 1 if provided)
```

### Conductor (Agent Orchestration)

#### POST /api/conductor
```typescript
// Required fields
message: string (1-2000 chars, no XSS)

// Optional fields
action: string (max 1000, no XSS)
params: object (any unknown values allowed)
timeout: number (100-300000 ms, default: 30000)
```

### Profiles

#### GET /api/profiles
```typescript
// Query parameters (optional)
userId: string (alphanumeric + _ - , max 100 chars, optional)
```

## Security Features

### Input Sanitization

1. **XSS Prevention**
   - SafeStringSchema prevents `<script>` and `javascript:` patterns
   - HTML entities are not explicitly escaped (safe by default in JSON responses)

2. **SQL Injection Prevention**
   - Type validation prevents string concatenation attacks
   - Use parameterized queries at database layer

3. **Path Traversal Prevention**
   - Enum validation for categorical fields
   - Alphanumeric + limited characters in ID fields

4. **Type Safety**
   - Zod ensures type correctness before runtime
   - Number fields validated as integers/positive

### Validation Error Response

All validation errors return `400 Bad Request`:

```json
{
  "success": false,
  "error": "Validation failed",
  "validationErrors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Rate Limiting

Every endpoint has rate limiting applied BEFORE validation:
- Login: 5 requests/min per IP
- Brain: 30 requests/min per user
- Metrics: 20 requests/min per user
- Conductor: 10 requests/min per user

## Implementation Examples

### Validating Request Body

```typescript
import { validateBody } from '@/lib/validation/middleware'
import { LoginRequestSchema, type LoginRequest } from '@/lib/validation/schemas'

export async function POST(request: NextRequest) {
  const bodyResult = await validateBody<LoginRequest>(request, LoginRequestSchema)
  
  if (!bodyResult.success) {
    return bodyResult.response // 400 with validation errors
  }
  
  const { email, password } = bodyResult.data
  // ... process validated data
}
```

### Validating Query Parameters

```typescript
import { validateQuery } from '@/lib/validation/middleware'
import { BrainQuerySchema, type BrainQuery } from '@/lib/validation/schemas'

export async function GET(request: NextRequest) {
  const queryResult = await validateQuery<BrainQuery>(request, BrainQuerySchema)
  
  if (!queryResult.success) {
    return queryResult.response // 400 with validation errors
  }
  
  const { category, limit } = queryResult.data
  // ... process validated data
}
```

## Testing

### Run Validation Tests

```bash
npm test -- validation.integration.test.ts
```

### Test Coverage

- ✅ Valid inputs accepted
- ✅ Invalid inputs rejected (400)
- ✅ Missing required fields rejected
- ✅ Type mismatches caught
- ✅ XSS patterns blocked
- ✅ Injection attacks prevented
- ✅ Field defaults applied
- ✅ Email normalization works

## Adding New Endpoints

To add validation to a new endpoint:

1. **Define Schema** in `/lib/validation/schemas.ts`
   ```typescript
   export const MyEndpointSchema = z.object({
     field1: z.string().min(1),
     field2: z.number().int().positive(),
   })
   export type MyEndpoint = z.infer<typeof MyEndpointSchema>
   ```

2. **Use in Route Handler**
   ```typescript
   const result = await validateBody<MyEndpoint>(request, MyEndpointSchema)
   if (!result.success) return result.response
   ```

3. **Add Tests** in `/lib/validation/validation.integration.test.ts`
   ```typescript
   it('rejects invalid input', () => {
     const result = MyEndpointSchema.safeParse(invalidData)
     expect(result.success).toBe(false)
   })
   ```

## Maintenance

### Regular Audits

- [ ] Review validation rules quarterly
- [ ] Check for emerging XSS patterns
- [ ] Update regex patterns as needed
- [ ] Monitor validation failure logs

### Schema Evolution

When updating schemas:
1. Add new field with `.optional()` initially
2. Add tests for new field
3. Update this documentation
4. Deploy and monitor for errors
5. Make field required in next major version if needed

## Performance Considerations

- Zod validation is fast (microseconds per validation)
- Validations happen in-process before business logic
- No external calls during validation
- Caching not needed (lightweight)

## References

- [Zod Documentation](https://zod.dev)
- [OWASP Input Validation](https://owasp.org/www-community/attacks/xss/#context-1-html-body)
- [CWE-79: XSS](https://cwe.mitre.org/data/definitions/79.html)
