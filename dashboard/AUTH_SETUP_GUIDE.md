# NextAuth.js Authentication Setup Guide

Complete implementation guide for NextAuth.js authentication in the OmniForge Dashboard. This document covers all components, configuration, and integration steps.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Configuration Files](#configuration-files)
5. [Environment Variables](#environment-variables)
6. [API Route Protection](#api-route-protection)
7. [Usage Examples](#usage-examples)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)

## Overview

The authentication system implements:
- **JWT-based authentication** using jsonwebtoken
- **NextAuth.js** for session management
- **Role-Based Access Control (RBAC)** with 3 roles: admin, user, viewer
- **Middleware-level protection** for all /api/* routes
- **Comprehensive error handling and logging**
- **Token refresh mechanism** for long-lived sessions

### Key Features

- ✅ Stateless JWT authentication
- ✅ Automatic token refresh
- ✅ Role-based access control
- ✅ Per-route permission checking
- ✅ Correlation ID tracking for requests
- ✅ Comprehensive audit logging
- ✅ Rate limiting on auth endpoints

## Architecture

```
Request Flow:
1. Client sends Authorization: Bearer <token>
2. Middleware validates JWT
3. Middleware checks role/permissions
4. Middleware injects auth context into request headers
5. API route handler accesses auth context via helpers
6. Response includes correlation ID for tracing
```

### Components

| File | Purpose |
|------|---------|
| `auth.config.ts` | NextAuth.js configuration with JWT strategy |
| `middleware-nextauth.ts` | Request-level auth validation and RBAC |
| `lib/auth.ts` | Token generation and verification utilities |
| `lib/auth-helpers.ts` | Helper functions for API routes |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth.js route handler |
| `app/api/protected-route-example/route.ts` | Example protected route |

## Installation

### 1. Install Dependencies

```bash
npm install next-auth jsonwebtoken @types/jsonwebtoken zod
```

Current versions in package.json:
- `next-auth`: ^5.0.0+ (if not already installed)
- `jsonwebtoken`: ^9.0.3 ✅ (already installed)
- `@types/jsonwebtoken`: ^9.0.5 ✅ (already installed)
- `zod`: ^3.25.76 ✅ (already installed)

### 2. Copy Configuration Files

Place these files in your project:

```
dashboard/
├── auth.config.ts                          # NextAuth.js config
├── middleware-nextauth.ts                  # Enhanced middleware
├── lib/
│   ├── auth.ts                             # Existing auth utilities ✅
│   ├── auth-helpers.ts                     # New helper functions
│   ├── logger.ts                           # Existing logger ✅
│   └── error-handling.ts                   # Existing error handling ✅
├── app/
│   └── api/
│       ├── auth/[...nextauth]/route.ts    # NextAuth route
│       └── protected-route-example/route.ts # Example route
└── middleware.ts                           # Use middleware-nextauth.ts content
```

### 3. Update next.config.js (if needed)

Ensure Next.js is configured for API routes:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure API routes are properly configured
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}

module.exports = nextConfig
```

## Configuration Files

### auth.config.ts

Main NextAuth.js configuration file. Key sections:

```typescript
// Session strategy: JWT-based (stateless)
session: {
  strategy: 'jwt',
  maxAge: 24 * 60 * 60,      // 24 hours
  updateAge: 60 * 60,         // Refresh every hour
}

// Providers: Credentials (JWT-based)
providers: [
  CredentialsProvider({
    async authorize(credentials) {
      // Validate credentials or verify provided tokens
      // Return user object with tokens
    }
  })
]

// Callbacks: JWT and Session customization
callbacks: {
  async jwt({ token, user }) {
    // Add user data to token
    // Implement token refresh logic
  },
  async session({ session, token }) {
    // Add custom data to session
  }
}
```

### middleware-nextauth.ts

Enhanced middleware that:
1. Validates JWT tokens
2. Checks role-based access control
3. Injects auth context into request headers
4. Logs authentication attempts
5. Returns appropriate error responses

### lib/auth-helpers.ts

Helper functions for API routes:

```typescript
// Get auth context from request headers
const authContext = getFullAuthContext(request)

// Verify authentication
const authResult = verifyAuth(request)
if (!authResult.authenticated) {
  return authResult.response
}

// Check role
if (!hasRole(request, ['admin', 'user'])) {
  return createUnauthorizedResponse(...)
}

// Check permission
if (!hasPermission(request, 'read:own')) {
  return createUnauthorizedResponse(...)
}
```

## Environment Variables

Create `.env.local` with:

```bash
# NextAuth Configuration
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>
NEXTAUTH_URL=http://localhost:3000

# JWT Configuration
JWT_SECRET=<same-strong-secret-key>

# API Configuration
API_URL=http://localhost:3000

# Optional: Logging
LOG_LEVEL=info
```

### Generate Secrets

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate JWT_SECRET (should match NEXTAUTH_SECRET for simplicity)
openssl rand -base64 32
```

## API Route Protection

### Basic Protection

Every API route should:

1. **Verify Authentication**

```typescript
import { verifyAuth } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  const authResult = verifyAuth(request)
  if (!authResult.authenticated) {
    return authResult.response
  }
  
  const user = authResult.user
  // Proceed with authenticated request
}
```

2. **Check Role/Permission**

```typescript
import { hasRole, hasPermission } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  // Verify auth first
  const authResult = verifyAuth(request)
  if (!authResult.authenticated) {
    return authResult.response
  }

  // Check role
  if (!hasRole(request, ['admin'])) {
    return createUnauthorizedResponse('Admin role required')
  }

  // Check permission
  if (!hasPermission(request, 'write:all')) {
    return createUnauthorizedResponse('write:all permission required')
  }
  
  // Proceed
}
```

3. **Access User Context**

```typescript
import { getFullAuthContext } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  const authContext = getFullAuthContext(request)
  
  console.log(authContext.userId)      // User ID
  console.log(authContext.userEmail)   // User email
  console.log(authContext.userRole)    // User role
  console.log(authContext.correlationId) // Request trace ID
}
```

### Protected Routes Configuration

Edit `middleware-nextauth.ts` to add/modify protected routes:

```typescript
const PROTECTED_ROUTES = [
  '/api/alerts',
  '/api/brain',
  '/api/conductor',
  '/api/kanban',
  '/api/meetings',
  '/api/metrics',
  '/api/profiles',
  // Add new protected routes here
]

const ROUTE_ACCESS_CONFIG: Record<string, UserRole[]> = {
  '/api/alerts': ['admin', 'user'],
  '/api/brain': ['admin', 'user'],
  '/api/conductor': ['admin', 'user'],
  '/api/kanban': ['admin', 'user'],
  '/api/meetings': ['admin', 'user'],
  '/api/metrics': ['admin', 'user', 'viewer'],
  '/api/profiles': ['admin', 'user'],
  // Add role requirements here
}
```

## Usage Examples

### Example 1: Simple GET Endpoint

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, getFullAuthContext } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  const authResult = verifyAuth(request)
  if (!authResult.authenticated) {
    return authResult.response
  }

  const user = getFullAuthContext(request)

  return NextResponse.json({
    success: true,
    message: `Hello, ${user.userEmail}!`,
    data: {
      userId: user.userId,
      role: user.userRole,
    },
  })
}
```

### Example 2: Admin-Only Endpoint

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, hasRole, createUnauthorizedResponse } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  const authResult = verifyAuth(request)
  if (!authResult.authenticated) {
    return authResult.response
  }

  if (!hasRole(request, ['admin'])) {
    return createUnauthorizedResponse('Admin access required')
  }

  // Process admin request
  return NextResponse.json({ success: true })
}
```

### Example 3: Using Middleware Wrapper

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-helpers'

async function handler(request: NextRequest) {
  // This function is only called if user is authenticated
  // and has required role
  return NextResponse.json({ success: true })
}

export const GET = withAuth(handler, ['admin', 'user'])
```

## Testing

### Manual Testing with cURL

#### Generate Token

```bash
# Request token from /api/auth endpoint
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "email": "user@example.com",
    "role": "user"
  }'

# Response:
# {
#   "accessToken": "eyJhbGc...",
#   "refreshToken": "eyJhbGc...",
#   "expiresIn": 86400,
#   "tokenType": "Bearer"
# }
```

#### Use Token to Access Protected Route

```bash
curl -X GET http://localhost:3000/api/protected-route-example \
  -H "Authorization: Bearer eyJhbGc..."
```

### Unit Tests

Example test for auth helpers:

```typescript
import { getFullAuthContext, hasRole, isAuthenticated } from '@/lib/auth-helpers'
import { NextRequest } from 'next/server'

describe('auth-helpers', () => {
  it('should verify authentication', () => {
    const request = new NextRequest('http://localhost:3000/api/test')
    request.headers.set('x-auth-verified', 'true')
    request.headers.set('x-user-id', 'user-123')
    
    const result = isAuthenticated(request)
    expect(result).toBe(true)
  })

  it('should check user role', () => {
    const request = new NextRequest('http://localhost:3000/api/test')
    request.headers.set('x-user-role', 'admin')
    
    expect(hasRole(request, ['admin'])).toBe(true)
    expect(hasRole(request, ['user'])).toBe(false)
  })
})
```

## Troubleshooting

### Issue: "JWT_SECRET not configured"

**Solution**: Set `JWT_SECRET` and `NEXTAUTH_SECRET` in `.env.local`

```bash
JWT_SECRET=your-secret-key
NEXTAUTH_SECRET=your-secret-key
```

### Issue: "Authentication required" on protected route

**Check**:
1. Token is included in `Authorization: Bearer <token>` header
2. Token is valid and not expired
3. JWT_SECRET matches the secret used to generate the token

```bash
curl -X GET http://localhost:3000/api/protected-route-example \
  -H "Authorization: Bearer eyJhbGc..."
```

### Issue: "Insufficient permissions"

**Check**:
1. User role is correct (admin, user, or viewer)
2. Route is configured in `ROUTE_ACCESS_CONFIG`
3. User role is listed for that route

```typescript
// In middleware-nextauth.ts
const ROUTE_ACCESS_CONFIG: Record<string, UserRole[]> = {
  '/api/protected-route': ['admin'], // User needs 'admin' role
}
```

### Issue: Correlation ID not in response

**Solution**: Ensure middleware sets correlation ID header:

```typescript
response.headers.set('x-correlation-id', correlationId)
```

### Issue: Token verification failing

**Debug**: Check token claims:

```bash
# Decode JWT (use jwt.io or similar)
# Verify:
# 1. Signature is valid with your JWT_SECRET
# 2. 'exp' claim is in the future
# 3. 'sub', 'email', 'role' are present
```

## Integration Checklist

- [ ] Install next-auth and dependencies
- [ ] Create `.env.local` with NEXTAUTH_SECRET and JWT_SECRET
- [ ] Copy `auth.config.ts` to project root
- [ ] Copy `middleware-nextauth.ts` to project root (replace existing middleware.ts)
- [ ] Copy `lib/auth-helpers.ts` to lib directory
- [ ] Create `app/api/auth/[...nextauth]/route.ts`
- [ ] Test auth endpoint: `POST /api/auth`
- [ ] Test protected route with token
- [ ] Configure protected routes in middleware
- [ ] Add role requirements to `ROUTE_ACCESS_CONFIG`
- [ ] Update all API routes to use `verifyAuth()`
- [ ] Add tests for auth helpers
- [ ] Review logs for auth attempts
- [ ] Test token refresh mechanism
- [ ] Verify correlation IDs in responses

## Next Steps

1. **Implement user credential validation** in `auth.config.ts` `validateUserCredentials()` function
2. **Add database integration** for user storage
3. **Implement password hashing** (bcrypt recommended)
4. **Add refresh token rotation** for enhanced security
5. **Set up audit logging** for all auth events
6. **Configure HTTPS** in production
7. **Add rate limiting** to auth endpoints
8. **Implement logout** endpoint with token blacklisting

## Support

For issues or questions, refer to:
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [JWT.io](https://jwt.io/)
- Project documentation in `/docs/authentication.md`
