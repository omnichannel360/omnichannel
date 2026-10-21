# Auth Middleware Implementation Guide

## Overview

Centralized authentication middleware that protects all API endpoints globally. The middleware validates JWT tokens at the Next.js edge and attaches authentication context to protected routes.

## Status: Current Implementation

### Auth Middleware Architecture

**Location:** `lib/middleware/auth-middleware.ts`

**Key Components:**
1. `requireAuth()` - Validates JWT token from request header
2. `checkRole()` - Enforces role-based access control (RBAC)
3. `withAuth()` - HOF wrapper for protecting handlers
4. `validateRequestAuth()` - Middleware-level auth validation

**Authentication Flow:**
```
Client Request
    ↓
Bearer Token Extraction (Authorization header)
    ↓
JWT Verification (lib/auth.ts)
    ↓
Token Payload Validation
    ↓
Role-Based Access Check
    ↓
Handler Execution or Error Response
```

---

## Protected Endpoints Configuration

### Routes to Protect (Authentication Required)

| Endpoint | Method | Role Required | Purpose |
|----------|--------|---------------|---------|
| `/api/alerts` | GET, POST | user | Fetch and manage alerts |
| `/api/brain` | GET, POST | user | Access company brain data |
| `/api/conductor` | GET, POST | user | Orchestration endpoints |
| `/api/kanban` | GET, POST | user | Kanban board operations |
| `/api/meetings` | GET, POST, PUT, DELETE | user | Meeting management |
| `/api/metrics` | GET | user | System metrics |
| `/api/profiles` | GET, POST, PUT | user | User profile management |

### Public Endpoints (No Authentication)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | User authentication |
| `/api/auth/verify` | POST | Token verification |
| `/api/health` | GET | Health check (monitoring) |

---

## Implementation Steps

### Step 1: Apply withAuth to Protected Endpoints

#### Example 1: Simple GET Endpoint (metrics)

```typescript
import { withAuth } from '@/lib/middleware/auth-middleware'
import { NextRequest, NextResponse } from 'next/server'

export const GET = withAuth(async (request, auth) => {
  // auth.userId contains the authenticated user ID
  // auth.payload contains full JWT payload
  
  try {
    const metrics = await getSystemMetrics()
    return NextResponse.json({ success: true, data: metrics })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch metrics' }, { status: 500 })
  }
})
```

#### Example 2: Protected POST with Role Check

```typescript
import { withAuth } from '@/lib/middleware/auth-middleware'

export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json()
    return NextResponse.json({ success: true })
  },
  { requiredRole: 'admin' } // Only admins can create alerts
)

export const GET = withAuth(async (request, auth) => {
  // Any authenticated user can read
  return NextResponse.json({ success: true })
})
```

#### Example 3: Multiple Role Support

```typescript
export const PUT = withAuth(
  async (request, auth) => {
    return NextResponse.json({ success: true })
  },
  { requiredRole: ['admin', 'moderator'] }
)
```

---

## Security Best Practices

### 1. Token Management

✅ **DO:**
- Validate token expiry before use
- Store JWT_SECRET in environment variables
- Use HTTPS for all auth endpoints
- Implement token rotation for refresh tokens

❌ **DON'T:**
- Hardcode secrets in code
- Store tokens in localStorage (use httpOnly cookies)
- Trust client-provided user IDs

### 2. Role-Based Access Control

```typescript
// CORRECT: Role-based protection
export const DELETE = withAuth(handler, { requiredRole: 'admin' })

// CORRECT: Multiple allowed roles
export const UPDATE = withAuth(handler, { requiredRole: ['admin', 'moderator'] })
```

### 3. Error Handling

```typescript
// CORRECT: Don't leak information
return NextResponse.json(
  { error: 'Unauthorized' },
  { status: 401 }
)
```

---

## Verification Checklist

### Code Level
- [ ] All protected routes use `withAuth()` wrapper
- [ ] Role requirements specified where needed
- [ ] Public endpoints don't require auth
- [ ] Error responses don't leak sensitive info
- [ ] All JWT secrets use environment variables

### Testing Level
- [ ] Auth middleware tests pass (80%+ coverage)
- [ ] Each protected endpoint rejects unauthorized requests
- [ ] Role-based access control tested
- [ ] Token expiry handled correctly
- [ ] Public endpoints work without tokens

### Security Level
- [ ] No hardcoded credentials
- [ ] HTTPS enforced in production
- [ ] Rate limiting applied
- [ ] Audit logging in place
- [ ] Token validation on every request

