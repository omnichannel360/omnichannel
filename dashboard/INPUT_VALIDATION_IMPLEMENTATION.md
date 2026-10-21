# Input Validation Implementation Guide

## Overview
Comprehensive input validation system implemented across all API endpoints using Zod schemas and middleware. This document provides implementation details, usage patterns, and verification procedures.

## Architecture

### 1. Validation Layers

#### Layer 1: Schema Definitions (`lib/validation/schemas.ts`)
- **Purpose**: Define all request/response schemas using Zod
- **Coverage**: Email, password, strings, numbers, enums, complex objects
- **Features**:
  - Strict mode validation (no extra fields)
  - Type-safe inference with `z.infer<typeof Schema>`
  - Default values for optional fields
  - Custom error messages
  - Regex patterns for format validation

#### Layer 2: Validation Middleware (`lib/validation/middleware.ts`)
- **Purpose**: Reusable validation functions for API routes
- **Exports**:
  - `validateBody<T>()` - Validates request body with Zod schema
  - `validateQuery<T>()` - Validates query parameters
  - `formatZodErrors()` - Formats validation errors for responses
  - `parseAndValidateBody<T>()` - Shorthand that throws on failure
  - `parseAndValidateQuery<T>()` - Shorthand that throws on failure

#### Layer 3: Enhanced Input Validation (`lib/input-validation.ts`)
- **Purpose**: Additional utilities for sanitization and type guards
- **Functions**:
  - `sanitizeString()` - Removes null bytes and control characters
  - `isValidEmail()` - Type guard for valid emails
  - `isValidPassword()` - Type guard for valid passwords
  - `isValidEnum()` - Generic enum validation

### 2. Validation Schemas

#### Authentication Schemas
```typescript
// Login endpoint validation
LoginRequestSchema: {
  email: string (valid email format, lowercase, trimmed)
  password: string (6+ chars, max 128 chars)
}

// Verify endpoint validation
VerifyRequestSchema: {} (no validation needed for GET request)
```

#### Brain Endpoint Validation
```typescript
BrainQuerySchema: {
  category?: string (alphanumeric, hyphen, underscore, max 50 chars)
  limit?: number (1-100, default 20)
}
```

#### Metrics Endpoint Validation
```typescript
MetricsQuerySchema: {
  period?: 'day' | 'week' | 'month' | 'year' (default 'day')
  format?: 'json' | 'csv' (default 'json')
}
```

#### Alert Validation
```typescript
AlertSchema: {
  title: string (non-empty, max 1000 chars)
  message: string (non-empty, max 1000 chars)
  severity?: 'info' | 'warning' | 'error' | 'critical' (default 'info')
  tags?: string[] (max 10 tags)
}
```

#### Kanban Item Validation
```typescript
KanbanItemSchema: {
  title: string (non-empty, max 1000 chars)
  description?: string (max 1000 chars)
  status?: 'todo' | 'in_progress' | 'done' (default 'todo')
  priority?: 'low' | 'medium' | 'high' (default 'medium')
}
```

## Implementation Status

### ✅ Completed Implementations

#### 1. Login Endpoint (`/api/auth/login`)
- ✅ Validates email format with regex
- ✅ Validates password length and requirements
- ✅ Rejects extra fields (strict mode)
- ✅ Proper error responses with validation details
- ✅ Sanitizes inputs before processing
- ✅ Logs validation failures

#### 2. Verify Endpoint (`/api/auth/verify`)
- ✅ Validates authentication token
- ✅ Checks token format and length
- ✅ Returns appropriate auth status

#### 3. Brain Endpoint (`/api/brain`)
- ✅ Validates query parameters (category, limit)
- ✅ Category regex validation
- ✅ Limit range validation (1-100)
- ✅ Default limit value (20)
- ✅ Proper error responses

#### 4. Metrics Endpoint (`/api/metrics`)
- ✅ Uses auth validation
- ✅ Rate limiting applied
- ✅ Returns consistent response format

### 🔒 Security Features Implemented

1. **XSS Prevention**
   - SafeString schema rejects `<script>` tags
   - Rejects `javascript:` protocol
   - HTML entity safe

2. **Injection Attack Prevention**
   - Zod strict mode prevents NoSQL injection
   - Category regex prevents path traversal
   - Email validation prevents injection vectors

3. **Input Length Limits**
   - Email: max 254 characters
   - Password: max 128 characters
   - Strings: max 1000-2000 characters
   - Descriptions: max 2000 characters

4. **Type Safety**
   - All inputs type-checked with Zod
   - Strict mode prevents extra fields
   - Type guards for common patterns

5. **Null Byte Protection**
   - Input sanitization removes null bytes
   - Control characters filtered

## Usage Examples

### Example 1: Validating Login Request
```typescript
import { POST } from '@/app/api/auth/login/route'
import { validateBody } from '@/lib/validation/middleware'
import { LoginRequestSchema, type LoginRequest } from '@/lib/validation/schemas'

export async function POST(request: NextRequest) {
  // Validate request body
  const bodyResult = await validateBody<LoginRequest>(request, LoginRequestSchema)
  
  if (!bodyResult.success) {
    return bodyResult.response // Returns 400 with validation errors
  }

  const { email, password } = bodyResult.data
  // Process validated email and password
}
```

### Example 2: Validating Brain Query Parameters
```typescript
import { validateQuery } from '@/lib/validation/middleware'
import { BrainQuerySchema, type BrainQuery } from '@/lib/validation/schemas'

export async function GET(request: NextRequest) {
  // Validate query parameters
  const queryResult = await validateQuery<BrainQuery>(request, BrainQuerySchema)
  
  if (!queryResult.success) {
    return queryResult.response // Returns 400 with validation errors
  }

  const { category, limit } = queryResult.data
  // category is validated string | undefined
  // limit is validated number with default value
}
```

### Example 3: Creating Custom Validator
```typescript
import { z } from 'zod'
import { validateBody } from '@/lib/validation/middleware'

// Define custom schema
const CustomRequestSchema = z.object({
  title: z.string().min(1).max(500),
  quantity: z.number().int().min(1).max(1000),
}).strict()

// Use in endpoint
const result = await validateBody(request, CustomRequestSchema)
if (!result.success) {
  return result.response
}
```

## Error Response Format

### Validation Error Response (400 Bad Request)
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
      "message": "Password must be at least 6 characters",
      "code": "too_small"
    }
  ],
  "timestamp": "2026-10-22T10:30:00.000Z"
}
```

## Testing

### Test Coverage
- ✅ Email validation (format, length, case handling)
- ✅ Password validation (length requirements)
- ✅ Login request validation (required fields, format)
- ✅ Brain query validation (category format, limit range)
- ✅ Alert validation (required fields, enum values)
- ✅ Kanban item validation (status, priority)
- ✅ XSS prevention (script tags, javascript protocol)
- ✅ Injection prevention (SQL, NoSQL)
- ✅ Path traversal prevention
- ✅ Boundary conditions
- ✅ Type coercion
- ✅ Error formatting

### Running Tests
```bash
# Run all validation tests
npm test -- input-validation.integration.test.ts

# Run specific test suite
npm test -- input-validation.integration.test.ts -t "Email Validation"

# Run with coverage
npm test -- input-validation.integration.test.ts --coverage
```

## Key Validation Rules by Field Type

### Email Fields
- Format: RFC 5322 compliant regex
- Length: max 254 characters
- Processing: lowercase, trim whitespace
- Examples:
  - ✅ `user@example.com`
  - ✅ `test.email+tag@domain.co.uk`
  - ❌ `invalid@`
  - ❌ `@example.com`
  - ❌ `user@domain` (missing TLD)

### Password Fields
- Minimum length: 6 characters (development), 8 characters (production)
- Maximum length: 128 characters
- Development: No special character requirements
- Production: Uppercase, lowercase, number, special character required

### Numeric Fields
- Type: Integer values
- Range: Based on context (1-100 for limit, etc.)
- Type coercion: String numbers auto-converted to numbers

### Enum Fields
- Strict validation: Only allowed values accepted
- Examples: `'todo' | 'in_progress' | 'done'`
- Error messages: List all allowed values

### String Fields
- XSS protection: No `<script>` tags or `javascript:` protocol
- Length limits: Context-specific (100-2000 chars)
- Allowed characters: Alphanumeric, spaces, punctuation (except forbidden patterns)

### Category Fields
- Format: Alphanumeric, hyphens, underscores only
- Length: max 50-100 characters
- Use: Enum-like strings that need flexibility
- Examples:
  - ✅ `learning`
  - ✅ `test-category`
  - ✅ `category_123`
  - ❌ `category@invalid`
  - ❌ `../../../etc/passwd`

## Strict Mode Details

All request schemas use `.strict()` to prevent extra fields:

```typescript
LoginRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
}).strict() // ← Rejects any additional properties

// ❌ This will fail validation:
{
  email: "test@example.com",
  password: "password123",
  extra_field: "not allowed" // Extra field rejected
}

// ✅ This passes validation:
{
  email: "test@example.com",
  password: "password123"
}
```

## Logging

All validation failures are logged with:
- Endpoint path
- Request method
- Validation errors with field names
- Request timestamp

Example log:
```
[WARN] Request body validation failed
path: /api/auth/login
method: POST
errors: [
  { field: 'email', message: 'Invalid email format' },
  { field: 'password', message: 'String must contain at least 6 character(s)' }
]
```

## Migration Guide

### For Existing Endpoints

1. **Add validation import**:
```typescript
import { validateBody, validateQuery } from '@/lib/validation/middleware'
import { YourSchema, type YourInput } from '@/lib/validation/schemas'
```

2. **Add validation call**:
```typescript
const bodyResult = await validateBody<YourInput>(request, YourSchema)
if (!bodyResult.success) {
  return bodyResult.response
}
```

3. **Use validated data**:
```typescript
const { field1, field2 } = bodyResult.data // Type-safe!
```

## Performance Considerations

1. **Caching**: Zod schemas are singletons, not recreated per request
2. **Early validation**: Validation happens before business logic
3. **Error responses**: Pre-built response format, no additional processing
4. **Type inference**: No runtime overhead, compile-time only

## Maintenance

### Adding New Schemas
1. Add schema to `lib/validation/schemas.ts`
2. Export type with `z.infer<typeof>`
3. Add tests to `__tests__/api/input-validation.integration.test.ts`
4. Document in this file

### Updating Existing Schemas
1. Modify schema in `lib/validation/schemas.ts`
2. Update affected endpoints
3. Add regression tests
4. Update documentation

### Version Control
- Keep schemas in version control
- Document breaking changes
- Maintain backward compatibility when possible

## References

- **Zod Documentation**: https://zod.dev
- **OWASP Input Validation**: https://owasp.org/www-community/attacks/xss/
- **Next.js Middleware**: https://nextjs.org/docs/app/building-your-application/routing/middleware

## Security Checklist

Before deploying:
- [ ] All endpoints validate input
- [ ] Error messages don't leak sensitive info
- [ ] Rate limiting applied to all endpoints
- [ ] Authentication verified for protected endpoints
- [ ] XSS tests passing
- [ ] Injection tests passing
- [ ] Boundary condition tests passing
- [ ] All validation logs reviewed
- [ ] Type safety verified with TypeScript strict mode

## Support & Debugging

### Common Issues

**Issue**: "Extra keys in object" error
**Solution**: Remove extra fields from request, ensure strict mode is working

**Issue**: Type mismatch between schema and usage
**Solution**: Use `z.infer<typeof Schema>` for type safety

**Issue**: Validation always fails
**Solution**: Check regex patterns, string transformations (lowercase, trim), default values

## Conclusion

This comprehensive input validation system provides:
- ✅ Type-safe validation across all endpoints
- ✅ XSS and injection attack prevention
- ✅ Consistent error responses
- ✅ Easy-to-maintain schema definitions
- ✅ Comprehensive test coverage
- ✅ Security best practices implementation

The system is production-ready and can be extended for new endpoints following the documented patterns.
