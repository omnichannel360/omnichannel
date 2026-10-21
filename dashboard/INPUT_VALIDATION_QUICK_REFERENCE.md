# Input Validation Quick Reference

## TL;DR - Implementation in 3 Steps

### Step 1: Define Schema
```typescript
// lib/validation/schemas.ts
import { z } from 'zod'

export const MyRequestSchema = z.object({
  email: EmailSchema,
  title: z.string().min(1).max(500),
  status: z.enum(['active', 'inactive']),
}).strict()

export type MyRequest = z.infer<typeof MyRequestSchema>
```

### Step 2: Import Validation
```typescript
import { validateBody } from '@/lib/validation/middleware'
import { MyRequestSchema, type MyRequest } from '@/lib/validation/schemas'
```

### Step 3: Validate Input
```typescript
export async function POST(request: NextRequest) {
  const result = await validateBody<MyRequest>(request, MyRequestSchema)
  
  if (!result.success) {
    return result.response // Returns 400 with validation errors
  }

  const { email, title, status } = result.data // Type-safe!
  // ... rest of handler
}
```

---

## API Validation Template

### POST Endpoint (Request Body Validation)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateBody } from '@/lib/validation/middleware'
import { MyRequestSchema, type MyRequest } from '@/lib/validation/schemas'
import { createLogger, createLogContext } from '@/lib/logger'

const logger = createLogger('my-endpoint-api')

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    operation: 'my_operation',
  })

  // Apply rate limiting (if needed)
  const rateLimitError = await applyRateLimit(request, 'my-endpoint')
  if (rateLimitError) {
    return rateLimitError
  }

  try {
    // Validate request body
    const bodyResult = await validateBody<MyRequest>(request, MyRequestSchema)
    if (!bodyResult.success) {
      logger.warn('Request validation failed', {
        ...logContext,
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
        errors: bodyResult.response,
      })
      return bodyResult.response
    }

    const { email, title, status } = bodyResult.data

    // Your business logic here
    const result = await processRequest(email, title, status)

    logger.info('Operation completed successfully', {
      ...logContext,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    })

    return NextResponse.json(
      { success: true, data: result },
      { status: 200 }
    )
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

### GET Endpoint (Query Parameter Validation)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateQuery } from '@/lib/validation/middleware'
import { MyQuerySchema, type MyQuery } from '@/lib/validation/schemas'
import { createLogger, createLogContext } from '@/lib/logger'

const logger = createLogger('my-endpoint-api')

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const logContext = createLogContext({
    method: request.method,
    path: request.nextUrl.pathname,
    operation: 'my_query_operation',
  })

  try {
    // Validate query parameters
    const queryResult = await validateQuery<MyQuery>(request, MyQuerySchema)
    if (!queryResult.success) {
      logger.warn('Query validation failed', {
        ...logContext,
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
      })
      return queryResult.response
    }

    const { limit, category } = queryResult.data

    // Your business logic here
    const data = await fetchData(category, limit)

    logger.info('Query completed successfully', {
      ...logContext,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
    })

    return NextResponse.json(
      { success: true, data },
      { status: 200 }
    )
  } catch (error) {
    logger.error('Query failed', error, {
      ...logContext,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
    })
    return NextResponse.json(
      { success: false, error: 'Query failed' },
      { status: 500 }
    )
  }
}
```

---

## Common Schema Patterns

### Required String Field
```typescript
z.object({
  name: z.string().min(1, 'Name is required').max(100),
})
```

### Optional String Field
```typescript
z.object({
  description: z.string().max(1000).optional(),
})
```

### Email Field
```typescript
z.object({
  email: EmailSchema, // Pre-defined, handles lowercase + trim
})
```

### Password Field
```typescript
z.object({
  password: PasswordSchemaWeak, // For development
  password: PasswordSchema, // For production (requires special chars)
})
```

### Enum Field
```typescript
z.object({
  status: z.enum(['active', 'inactive', 'pending'], {
    errorMap: () => ({ message: 'Must be active, inactive, or pending' })
  }),
})
```

### Number Range
```typescript
z.object({
  limit: z.number().int().min(1).max(100),
})
```

### Numeric String Coercion (for query params)
```typescript
z.object({
  limit: z.union([z.string(), z.number()])
    .transform(val => typeof val === 'string' ? parseInt(val, 10) : val)
    .pipe(z.number().int().min(1).max(100)),
})
```

### Array Field
```typescript
z.object({
  tags: z.array(z.string()).max(10),
})
```

### Array with Enum
```typescript
z.object({
  permissions: z.array(
    z.enum(['read', 'write', 'delete'])
  ).min(1),
})
```

### Nested Object
```typescript
z.object({
  user: z.object({
    name: z.string(),
    email: EmailSchema,
  }),
})
```

### Safe String (XSS prevention)
```typescript
z.object({
  comment: SafeStringSchema.max(1000),
})
```

### Category (alphanumeric + hyphen/underscore)
```typescript
z.object({
  category: CategorySchema,
})
```

### Record/Dictionary
```typescript
z.object({
  metadata: z.record(z.unknown()),
})
```

### Default Values
```typescript
z.object({
  limit: z.number().default(20),
  sort: z.enum(['asc', 'desc']).default('asc'),
  active: z.boolean().default(true),
})
```

---

## Testing Your Validation

### Basic Test
```typescript
import { MyRequestSchema } from '@/lib/validation/schemas'

describe('MyRequest Validation', () => {
  it('should validate correct input', () => {
    const result = MyRequestSchema.safeParse({
      email: 'test@example.com',
      title: 'My Title',
      status: 'active',
    })
    expect(result.success).toBe(true)
  })

  it('should reject invalid email', () => {
    const result = MyRequestSchema.safeParse({
      email: 'invalid',
      title: 'My Title',
      status: 'active',
    })
    expect(result.success).toBe(false)
  })

  it('should reject extra fields', () => {
    const result = MyRequestSchema.safeParse({
      email: 'test@example.com',
      title: 'My Title',
      status: 'active',
      extra: 'field', // Not allowed!
    })
    expect(result.success).toBe(false)
  })
})
```

---

## Pre-built Schemas Available

### Email & Password
- `EmailSchema` - RFC 5322 compliant email
- `PasswordSchema` - Strong password (8+ chars, special chars required)
- `PasswordSchemaWeak` - Weak password (6+ chars, for development)

### Strings
- `StringSchema` - Basic string validation
- `SafeStringSchema` - XSS-safe string (no script tags)
- `CategorySchema` - Alphanumeric + hyphen/underscore
- `IdSchema` - ID format validation

### Numbers
- `PositiveNumberSchema` - Positive integers
- `LimitSchema` - Pagination limit (1-1000)
- `PaginationSchema` - Full pagination object

### Enums
- `AlertSeverity` - info, warning, error, critical
- `TaskStatus` - todo, in_progress, done
- `KanbanStatus` - todo, in_progress, done

### Complex
- `LoginRequestSchema` - Email + password
- `BrainQuerySchema` - Category + limit
- `MetricsQuerySchema` - Period + format
- `AlertSchema` - Full alert object
- `KanbanItemSchema` - Full kanban item

---

## Error Handling Patterns

### Pattern 1: Return Error Response
```typescript
const result = await validateBody(request, MySchema)
if (!result.success) {
  return result.response // Returns 400 with validation errors
}
```

### Pattern 2: Throw and Catch
```typescript
try {
  const data = await parseAndValidateBody(request, MySchema)
  // Use data here
} catch (error) {
  // Handle validation error
}
```

### Pattern 3: Log Errors
```typescript
const result = await validateBody(request, MySchema)
if (!result.success) {
  logger.warn('Validation failed', {
    path: request.nextUrl.pathname,
    errors: result.response,
  })
  return result.response
}
```

---

## Security Best Practices

### ✅ DO:
- Use strict mode (`.strict()`) to prevent extra fields
- Validate all user inputs
- Use SafeStringSchema for user-generated content
- Set reasonable length limits
- Use enums for restricted values
- Log validation failures
- Return generic error messages to users
- Use type guards for additional safety

### ❌ DON'T:
- Skip validation on "trusted" inputs
- Use `any` type - use validation instead
- Return detailed error messages to users (could leak info)
- Allow unbounded string lengths
- Use RegExp without anchors
- Skip authentication before validation
- Trust external API responses without validation

---

## Debugging Validation Issues

### Issue: "Extra keys in object"
**Cause**: Sending fields not defined in schema
**Fix**: Remove extra fields or use `.extend()` to add them
```typescript
// ❌ Fails
{ email: "...", extra: "field" }

// ✅ Passes
{ email: "..." }
```

### Issue: Type not matching
**Cause**: Wrong data type for field
**Fix**: Convert to correct type or add transform
```typescript
// ❌ Fails - sending string instead of number
{ limit: "20" } // string!

// ✅ Passes - automatic coercion
{ limit: 20 } // number

// ✅ Or add transform for auto-coercion
limit: z.union([z.string(), z.number()]).transform(val => 
  typeof val === 'string' ? parseInt(val, 10) : val
)
```

### Issue: Enum validation fails
**Cause**: Value not in allowed list
**Fix**: Check exact spelling and case
```typescript
// ❌ Fails
{ status: "Active" } // Capital A!

// ✅ Passes
{ status: "active" } // Lowercase
```

### Issue: String exceeds max length
**Cause**: Input string too long
**Fix**: Trim input or increase max length
```typescript
z.string().max(100) // ← Increase if needed
```

---

## Advanced Patterns

### Conditional Validation
```typescript
const schema = z.object({
  type: z.enum(['A', 'B']),
  valueA: z.string().optional(),
  valueB: z.number().optional(),
}).refine(
  data => {
    if (data.type === 'A') return !!data.valueA
    if (data.type === 'B') return !!data.valueB
    return true
  },
  { message: 'Value required for selected type' }
)
```

### Custom Validation Message
```typescript
const schema = z.object({
  email: EmailSchema.refine(
    async (email) => await isEmailUnique(email),
    { message: 'Email already registered' }
  ),
})
```

### Transformation on Valid Data
```typescript
const schema = z.object({
  email: EmailSchema.transform(email => email.toLowerCase()),
  age: z.number().transform(age => Math.floor(age)),
})
```

### Multiple Schema Options
```typescript
const loginSchema = z.union([
  z.object({ email: EmailSchema, password: PasswordSchema }),
  z.object({ oauth_token: z.string() }),
])
```

---

## Validation Response Examples

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Validation Error Response (400)
```json
{
  "success": false,
  "error": "Request validation failed",
  "validationErrors": [
    {
      "field": "email",
      "message": "Invalid email format",
      "code": "invalid_string"
    }
  ],
  "timestamp": "2026-10-22T10:30:00.000Z"
}
```

### Server Error Response (500)
```json
{
  "success": false,
  "error": "Internal server error"
}
```

---

## Checklist for New Endpoints

- [ ] Created schema in `lib/validation/schemas.ts`
- [ ] Added type export with `z.infer<>`
- [ ] Imported schema in endpoint
- [ ] Added validation call (`validateBody` or `validateQuery`)
- [ ] Handle validation failure (`if (!result.success)`)
- [ ] Use validated data (type-safe)
- [ ] Added tests for valid input
- [ ] Added tests for invalid inputs
- [ ] Added tests for boundary cases
- [ ] Added tests for security (XSS, injection)
- [ ] Logged validation failures
- [ ] Verified error messages don't leak sensitive info

---

## Support Resources

- **Zod Docs**: https://zod.dev
- **Next.js Middleware**: https://nextjs.org/docs
- **OWASP Validation**: https://owasp.org
- **Tests**: `__tests__/api/input-validation.integration.test.ts`
- **Implementation Guide**: `INPUT_VALIDATION_IMPLEMENTATION.md`
