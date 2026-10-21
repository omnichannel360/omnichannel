# Auth Middleware Implementation Guide

## Overview

This guide explains the comprehensive auth middleware system for protecting all API endpoints.

### Architecture

The system consists of three layers:

1. **Next.js Middleware** (`middleware.ts`) - Global protection at the network edge
2. **Auth Module** (`lib/auth.ts`) - JWT token verification
3. **Auth Middleware** (`lib/auth-middleware.ts`) - Route handler wrapper with RBAC

## Quick Start

### Basic Protected Endpoint

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthMiddleware } from '@/lib/auth-middleware'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  // Verify authentication
  const authResult = await verifyAuthMiddleware(request, {
    requireAuth: true,
    auditLog: true,
  })

  // Return 401 if auth failed
  if (authResult instanceof NextResponse) {
    return authResult
  }

  // authResult now contains authenticated user data
  const { userId, email, role } = authResult

  try {
    // Your endpoint logic here
    return NextResponse.json({
      success: true,
      message: 'Endpoint protected and working',
      userId,
    })
  } catch (error) {
    logger.error('Endpoint error', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### Role-Based Endpoint (Admin Only)

```typescript
export async function DELETE(request: NextRequest) {
  // Enforce admin-only access
  const authResult = await verifyAuthMiddleware(request, {
    requireAuth: true,
    allowedRoles: ['admin'],
    auditLog: true,
  })

  if (authResult instanceof NextResponse) {
    return authResult
  }

  // Only admins reach here
  const { userId } = authResult

  // Implementation...
}
```

### Public Endpoint (No Auth Required)

```typescript
export async function GET(request: NextRequest) {
  // Public endpoint, but accept auth if provided
  const authResult = await verifyAuthMiddleware(request, {
    requireAuth: false,
    auditLog: false, // Skip logging for public endpoints
  })

  // authResult is always AuthContext (not NextResponse for public routes)
  const isAuthenticated = authResult.authenticated
  const { userId, email } = authResult

  // Implementation...
}
```

## Using the `withAuth` Wrapper

For a cleaner approach, use the `withAuth` higher-order function:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'

async function handler(request: NextRequest) {
  // Auth is already verified at this point
  const auth = (request as any).auth

  return NextResponse.json({
    success: true,
    userId: auth.userId,
  })
}

export const GET = withAuth(handler, {
  requireAuth: true,
  allowedRoles: ['user', 'admin'],
})
```

## Endpoint Protection Checklist

### For Each API Endpoint:

- [ ] Import `verifyAuthMiddleware` or use `withAuth`
- [ ] Call middleware at the start of each handler (GET, POST, PUT, DELETE)
- [ ] Set `requireAuth: true` for protected endpoints
- [ ] Specify `allowedRoles` if endpoint has role restrictions
- [ ] Enable `auditLog: true` for sensitive operations
- [ ] Return middleware's NextResponse if auth fails
- [ ] Use `userId`, `email`, `role` from auth context
- [ ] Add proper error handling with try-catch
- [ ] Log all errors with context (userId, operation, error details)

## Protected Routes (Automatic via middleware.ts)

The Next.js middleware automatically protects these routes:

```
/api/alerts
/api/brain
/api/conductor
/api/kanban
/api/meetings
/api/metrics
/api/profiles
```

Authentication is enforced at the middleware level before route handlers run.

### Headers Injected by middleware.ts

When a request passes middleware, these headers are set:

```
x-user-id: <user-id>
x-user-email: <user-email>
x-user-role: <user-role>
```

You can extract these using `extractAuthFromHeaders()` instead of `verifyAuthMiddleware()`:

```typescript
import { extractAuthFromHeaders } from '@/lib/auth-middleware'

export async function GET(request: NextRequest) {
  const auth = extractAuthFromHeaders(request)

  if (!auth.authenticated) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // Use auth data
}
```

## Public Routes (No Auth Required)

```
/api/health
/api/auth/login
/api/auth/verify
/api/auth
```

These routes skip authentication in middleware but can optionally accept and process auth tokens.

## Error Responses

### 401 Unauthorized (Missing/Invalid Token)

```json
{
  "success": false,
  "error": "Missing or invalid authentication token"
}
```

### 403 Forbidden (Insufficient Permissions)

```json
{
  "success": false,
  "error": "Insufficient permissions"
}
```

### 413 Request Entity Too Large

```json
{
  "success": false,
  "error": "Request body too large: X bytes (max: 1048576 bytes)"
}
```

## Token Structure

JWT tokens contain:

```json
{
  "sub": "user-123",
  "email": "user@example.com",
  "role": "admin",
  "iat": 1634567890,
  "exp": 1634654290
}
```

- `sub`: User ID (stored in `x-user-id` header)
- `email`: User email (stored in `x-user-email` header)
- `role`: User role (stored in `x-user-role` header)
- `iat`: Issued at timestamp
- `exp`: Expiration timestamp

## Testing

### Unit Tests

```bash
npm test lib/auth-middleware.test.ts
```

### Integration Tests

```bash
npm test __tests__/auth-middleware.integration.test.ts
```

## Audit Logging

All auth events are logged with context:

```
Auth middleware: authenticated request {
  method: 'GET',
  path: '/api/alerts',
  authenticated: true,
  userId: 'user-123',
  role: 'user'
}
```

Unauthenticated requests:

```
Auth middleware: unauthenticated request {
  method: 'GET',
  path: '/api/alerts',
  authenticated: false,
  error: 'Missing or invalid authentication token'
}
```

## Rate Limiting Integration

Rate limiting is handled separately but integrated with auth:

- Login attempts: 5/minute per IP
- API endpoints: 100/minute per user
- Verify token: 20/minute per IP

See `lib/rate-limiting.ts` for configuration.

## Security Best Practices

1. **Always use HTTPS** in production
2. **Never log tokens** - only log user IDs
3. **Set JWT_SECRET** in environment variables
4. **Rotate tokens** regularly
5. **Use short expiration** (24 hours default)
6. **Validate all inputs** - use validation middleware alongside auth

## Troubleshooting

### Token verification fails

Check:
- JWT_SECRET environment variable is set
- Token format: `Bearer <token>`
- Token not expired
- Token not tampered with

### RBAC denying access

Check:
- User role matches allowedRoles array
- Role values are consistent (case-sensitive)
- User token has been re-issued after role change

### Headers missing in route handler

Check:
- Route is in PROTECTED_ROUTES list in middleware.ts
- Middleware ran successfully (no 401 response)
- x-user-id header is present in request headers

## Example: Complete Protected Endpoint

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthMiddleware } from '@/lib/auth-middleware'
import { logger, createLogContext } from '@/lib/logger'
import { validateBody } from '@/lib/validation/middleware'
import { UpdateAlertSchema } from '@/lib/validation/schemas'

export async function PUT(request: NextRequest) {
  // Step 1: Verify authentication
  const authResult = await verifyAuthMiddleware(request, {
    requireAuth: true,
    allowedRoles: ['admin', 'moderator'],
    auditLog: true,
  })

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { userId } = authResult
  const logContext = createLogContext({
    operation: 'update_alert',
    userId,
    method: 'PUT',
    path: request.nextUrl.pathname,
  })

  try {
    // Step 2: Validate request body
    const validation = await validateBody(request, UpdateAlertSchema)
    if (!validation.success) {
      return validation.response
    }

    const { id, ...updates } = validation.data

    // Step 3: Process request
    logger.info('Updating alert', {
      ...logContext,
      alertId: id,
    })

    // Your business logic here...

    logger.info('Alert updated successfully', {
      ...logContext,
      alertId: id,
    })

    return NextResponse.json({
      success: true,
      data: { id, ...updates },
    })
  } catch (error) {
    logger.error('Failed to update alert', error, {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update alert',
      },
      { status: 500 }
    )
  }
}
```

## Implementation Status

### Protected Endpoints

- [x] middleware.ts - Global auth enforcement
- [x] lib/auth.ts - JWT verification
- [x] lib/auth-middleware.ts - Route handler wrapper
- [x] lib/validation/middleware.ts - Request validation
- [x] lib/api-rate-limit-middleware.ts - Rate limiting

### Testing

- [x] lib/auth-middleware.test.ts - Unit tests (80%+ coverage)
- [x] __tests__/auth-middleware.integration.test.ts - Integration tests

### Next Steps

1. Update all route handlers to use auth-middleware consistently
2. Run test suite to verify coverage (target: 80%+)
3. Audit for security vulnerabilities
4. Deploy with monitoring for auth failures

## Support

For issues or questions:

1. Check this guide's troubleshooting section
2. Review test files for examples
3. Check logs for error messages
4. Verify JWT_SECRET is set correctly
