# Input Validation - Quick Start Guide

## TL;DR

```typescript
import { validateBody } from '@/lib/validation/middleware'
import { LoginRequestSchema, type LoginRequest } from '@/lib/validation/schemas'

export async function POST(request: NextRequest) {
  // Validate request
  const result = await validateBody<LoginRequest>(request, LoginRequestSchema)
  if (!result.success) return result.response
  
  // Use validated data
  const { email, password } = result.data
}
```

---

## Available Schemas

### Authentication
- `LoginRequestSchema` - POST /api/auth/login
- `VerifyRequestSchema` - POST /api/auth/verify
- `TokenGenerationSchema` - POST /api/auth

### Data Queries
- `BrainQuerySchema` - GET /api/brain
- `MetricsQuerySchema` - GET /api/metrics

### Resources
- `KanbanItemSchema` - POST/PUT /api/kanban
- `MeetingSchema` - POST /api/meetings
- `AlertSchema` - POST /api/alerts
- `ProfileUpdateSchema` - PATCH /api/profiles

### System
- `ConductorRequestSchema` - POST /api/conductor

---

## Common Patterns

### Validate Request Body
```typescript
const result = await validateBody<LoginRequest>(request, LoginRequestSchema)
if (!result.success) return result.response
const data = result.data
```

### Validate Query Parameters
```typescript
const result = await validateQuery<BrainQuery>(request, BrainQuerySchema)
if (!result.success) return result.response
const { category, limit } = result.data
```

### Error Response Format
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
  "timestamp": "2024-10-22T10:30:00.000Z"
}
```

---

## Common Validation Rules

| Field | Rule | Example |
|-------|------|---------|
| Email | RFC 5322, 3-254 chars | user@example.com |
| Password | 6-128 chars | password123 |
| ID | Alphanumeric+_-, 1-100 chars | task_123 |
| Category | Alphanumeric+_-, 1-50 chars | user_profile |
| Limit | Integer, 1-1000 | 50 |
| Status | Enum (todo, in_progress, done) | in_progress |
| Severity | Enum (info, warning, error, critical) | warning |
| Role | Enum (user, admin, viewer) | admin |

---

## Testing Validation

```bash
# Run all tests
npm test -- lib/validation/schemas.test.ts

# Run specific test suite
npm test -- lib/validation/schemas.test.ts -t "Email"

# Check coverage
npm test -- --coverage lib/validation/
```

---

## Error Messages

| Scenario | Message |
|----------|---------|
| Invalid email | Invalid email format |
| Missing field | Required |
| String too long | String must not exceed X characters |
| Number out of range | Must be between X and Y |
| Invalid enum | Must be one of: value1, value2, value3 |
| XSS attempt | String contains forbidden patterns |

---

## Adding New Validation

1. Define schema:
```typescript
// lib/validation/schemas.ts
export const MySchema = z.object({
  field: z.string().min(1).max(100),
})
```

2. Use in endpoint:
```typescript
const result = await validateBody(request, MySchema)
if (!result.success) return result.response
```

3. Add test:
```typescript
// lib/validation/schemas.test.ts
test('validates my schema', () => {
  expect(MySchema.safeParse({ field: 'valid' }).success).toBe(true)
})
```

---

## Security Patterns

✅ **Blocked**:
- `<script>` tags
- `javascript:` protocol
- Path traversal (`../`, `..\\`)
- Special characters in IDs

✅ **Validated**:
- Email format (RFC 5322)
- String length (min/max)
- Numeric ranges
- Enum values (whitelist)
- DateTime format (ISO 8601)

---

## Performance

- Per-request overhead: < 1ms
- Schema compilation: One-time at startup
- Memory: ~50KB total

---

## Troubleshooting

**Question**: My validation fails unexpectedly  
**Answer**: Check the `validationErrors` array in the response for specific field and error code

**Question**: How do I validate custom formats?  
**Answer**: Use `.refine()` for custom validation logic

**Question**: Can I make fields optional?  
**Answer**: Use `.optional()` in the schema

**Question**: How do I set default values?  
**Answer**: Use `.default(value)` in the schema

---

## Reference

**Zod Docs**: https://zod.dev  
**Full Guide**: INPUT_VALIDATION_IMPLEMENTATION.md  
**Completion Report**: INPUT_VALIDATION_COMPLETION_REPORT.md
