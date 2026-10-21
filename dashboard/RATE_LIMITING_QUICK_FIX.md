# Rate Limiting - Quick Implementation Guide

## Copy-Paste Solutions for All Endpoints

### Pattern: Wrap Handler with Rate Limiting

```typescript
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/middleware/rateLimit'

// 1. Convert exports to async handler functions
async function getHandler(request: NextRequest) {
  // Your existing GET logic
}

async function postHandler(request: NextRequest) {
  // Your existing POST logic
}

// 2. Apply rate limiting wrapper to each method
export const GET = withRateLimit(
  async (request) => getHandler(request),
  { ...RATE_LIMIT_CONFIGS.{TYPE}, endpoint: 'api/{path}' }
)

export const POST = withRateLimit(
  async (request) => postHandler(request),
  { ...RATE_LIMIT_CONFIGS.{TYPE}, endpoint: 'api/{path}' }
)
```

---

## Missing Endpoints - Implementation Template

### 1. `/api/auth/verify`
**File**: `app/api/auth/verify/route.ts`

```typescript
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/middleware/rateLimit'

async function handler(request: NextRequest): Promise<NextResponse> {
  // Existing verify logic
}

export const GET = withRateLimit(
  async (request) => handler(request),
  { ...RATE_LIMIT_CONFIGS.authVerify, endpoint: 'api/auth/verify' }
)

export const POST = withRateLimit(
  async (request) => handler(request),
  { ...RATE_LIMIT_CONFIGS.authVerify, endpoint: 'api/auth/verify' }
)
```

**Config**: `authVerify` (10 req/min - allows frequent verification calls)

---

### 2. `/api/brain`
**File**: `app/api/brain/route.ts`

```typescript
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/middleware/rateLimit'

async function getHandler(request: NextRequest): Promise<NextResponse> {
  // Existing GET logic
}

async function postHandler(request: NextRequest): Promise<NextResponse> {
  // Existing POST logic
}

export const GET = withRateLimit(
  async (request) => getHandler(request),
  { ...RATE_LIMIT_CONFIGS.brain, endpoint: 'api/brain' }
)

export const POST = withRateLimit(
  async (request) => postHandler(request),
  { ...RATE_LIMIT_CONFIGS.brain, endpoint: 'api/brain' }
)
```

**Config**: `brain` (25 req/min - AI operations)

---

### 3. `/api/conductor`
**File**: `app/api/conductor/route.ts`

```typescript
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/middleware/rateLimit'

async function handler(request: NextRequest): Promise<NextResponse> {
  // Existing logic
}

export const GET = withRateLimit(
  async (request) => handler(request),
  { ...RATE_LIMIT_CONFIGS.conductor, endpoint: 'api/conductor' }
)

export const POST = withRateLimit(
  async (request) => handler(request),
  { ...RATE_LIMIT_CONFIGS.conductor, endpoint: 'api/conductor' }
)
```

**Config**: `conductor` (15 req/min - orchestration)

---

### 4. `/api/kanban`
**File**: `app/api/kanban/route.ts`

```typescript
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/middleware/rateLimit'

async function getHandler(request: NextRequest): Promise<NextResponse> {
  // Existing GET logic
}

async function postHandler(request: NextRequest): Promise<NextResponse> {
  // Existing POST logic
}

async function patchHandler(request: NextRequest): Promise<NextResponse> {
  // Existing PATCH logic
}

export const GET = withRateLimit(
  async (request) => getHandler(request),
  { ...RATE_LIMIT_CONFIGS.kanban, endpoint: 'api/kanban' }
)

export const POST = withRateLimit(
  async (request) => postHandler(request),
  { ...RATE_LIMIT_CONFIGS.kanban, endpoint: 'api/kanban' }
)

export const PATCH = withRateLimit(
  async (request) => patchHandler(request),
  { ...RATE_LIMIT_CONFIGS.kanban, endpoint: 'api/kanban' }
)
```

**Config**: `kanban` (30 req/min - board operations)

---

### 5. `/api/meetings`
**File**: `app/api/meetings/route.ts`

```typescript
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/middleware/rateLimit'

async function getHandler(request: NextRequest): Promise<NextResponse> {
  // Existing GET logic
}

async function postHandler(request: NextRequest): Promise<NextResponse> {
  // Existing POST logic
}

export const GET = withRateLimit(
  async (request) => getHandler(request),
  { ...RATE_LIMIT_CONFIGS.meetings, endpoint: 'api/meetings' }
)

export const POST = withRateLimit(
  async (request) => postHandler(request),
  { ...RATE_LIMIT_CONFIGS.meetings, endpoint: 'api/meetings' }
)
```

**Config**: `meetings` (20 req/min - file operations)

---

### 6. `/api/profiles`
**File**: `app/api/profiles/route.ts`

```typescript
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/middleware/rateLimit'

async function getHandler(request: NextRequest): Promise<NextResponse> {
  // Existing GET logic
}

async function postHandler(request: NextRequest): Promise<NextResponse> {
  // Existing POST logic
}

async function patchHandler(request: NextRequest): Promise<NextResponse> {
  // Existing PATCH logic
}

async function deleteHandler(request: NextRequest): Promise<NextResponse> {
  // Existing DELETE logic
}

export const GET = withRateLimit(
  async (request) => getHandler(request),
  { ...RATE_LIMIT_CONFIGS.profiles, endpoint: 'api/profiles' }
)

export const POST = withRateLimit(
  async (request) => postHandler(request),
  { ...RATE_LIMIT_CONFIGS.profiles, endpoint: 'api/profiles' }
)

export const PATCH = withRateLimit(
  async (request) => patchHandler(request),
  { ...RATE_LIMIT_CONFIGS.profiles, endpoint: 'api/profiles' }
)

export const DELETE = withRateLimit(
  async (request) => deleteHandler(request),
  { ...RATE_LIMIT_CONFIGS.profiles, endpoint: 'api/profiles' }
)
```

**Config**: `profiles` (30 req/min - user data)

---

## Verification Checklist

After applying rate limiting to each endpoint:

- [ ] All HTTP methods wrapped (GET, POST, PATCH, DELETE, etc.)
- [ ] Correct config type selected for endpoint
- [ ] Endpoint name matches route (e.g., 'api/kanban')
- [ ] Imports updated (withRateLimit, RATE_LIMIT_CONFIGS)
- [ ] No syntax errors (test with `npm run build`)
- [ ] Rate limit headers in response (check with curl)
- [ ] 429 response works (exceed rate limit and test)

## Testing Rate Limiting

### Curl Test
```bash
# Make requests until rate limited
for i in {1..10}; do
  curl -i http://localhost:3000/api/auth
  echo "Request $i"
done

# Should see 429 status code after limit exceeded
# Should see headers:
# X-RateLimit-Limit: 5
# X-RateLimit-Remaining: {count}
# X-RateLimit-Reset: {timestamp}
# Retry-After: {seconds}
```

### Manual Test
```typescript
// In component/test
const response = await fetch('/api/auth')
console.log(response.headers.get('X-RateLimit-Remaining'))
```

## Summary

- 6 endpoints need rate limiting applied
- Each follows the same pattern
- Copy-paste template provided for each
- ~5 minutes per endpoint to implement
- Full test coverage included
