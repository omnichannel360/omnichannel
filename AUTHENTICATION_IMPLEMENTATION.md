# JWT Authentication Implementation Guide

## Overview
This document provides complete implementation details for adding JWT authentication to all API endpoints using NextAuth.js and Jose for JWT verification.

---

## 1. FILE STRUCTURE

```
dashboard/
├── lib/
│   ├── auth.ts                    (Authentication utilities - CORE FILE)
│   └── auth.test.ts              (Authentication tests)
├── app/api/
│   ├── auth/
│   │   ├── login/route.ts         (Login endpoint)
│   │   ├── verify/route.ts        (Token verification)
│   │   └── refresh/route.ts       (Token refresh)
│   ├── alerts/route.ts            (Protected - Updated)
│   ├── brain/route.ts             (Protected - Updated)
│   ├── conductor/route.ts         (Protected - Updated)
│   ├── health/route.ts            (Public)
│   ├── kanban/route.ts            (Protected - Updated)
│   ├── meetings/route.ts          (Protected - Updated)
│   ├── metrics/route.ts           (Protected - Updated)
│   └── profiles/route.ts          (Protected - Updated)
├── middleware.ts                   (Global auth middleware)
├── .env.example                    (Environment template)
└── package.json                    (Updated dependencies)
```

---

## 2. IMPLEMENTATION STEPS

### Step 1: Install Dependencies

```bash
npm install jose jsonwebtoken
npm install --save-dev @types/jsonwebtoken
```

**Alternative for jose-only approach:**
```bash
npm install jose
```

### Step 2: Create Authentication Library (`lib/auth.ts`)

Use the **jose** library (recommended for Next.js 15+):

```typescript
import { jwtVerify, SignJWT } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-key-change-in-production'
)

export interface JWTPayload {
  sub: string
  email: string
  role: 'admin' | 'user' | 'service'
  iat?: number
  exp?: number
}

export async function createToken(payload: Omit<JWTPayload, 'iat' | 'exp'>) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(SECRET)
  return token
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const verified = await jwtVerify(token, SECRET)
    return verified.payload as JWTPayload
  } catch {
    return null
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7)
}

export async function verifyAuth(request: NextRequest) {
  const token = getTokenFromRequest(request)

  if (!token) {
    return {
      authenticated: false,
      error: 'Missing or invalid authorization header',
      status: 401,
    }
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return {
      authenticated: false,
      error: 'Invalid or expired token',
      status: 401,
    }
  }

  return {
    authenticated: true,
    payload,
    error: null,
    status: 200,
  }
}

export function createUnauthorizedResponse(message: string) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 401 }
  )
}

export function createForbiddenResponse(message: string) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 403 }
  )
}

export function requireRole(allowedRoles: string[], userRole: string): boolean {
  return allowedRoles.includes(userRole)
}
```

### Step 3: Global Middleware (`middleware.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from './lib/auth'

const PROTECTED_ROUTES = [
  '/api/alerts',
  '/api/brain',
  '/api/conductor',
  '/api/kanban',
  '/api/meetings',
  '/api/metrics',
  '/api/profiles',
]

const PUBLIC_ROUTES = ['/api/health', '/api/auth']

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Check if route is protected
  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route))
  const isPublic = PUBLIC_ROUTES.some(route => pathname.startsWith(route))

  if (!isProtected || isPublic) {
    return NextResponse.next()
  }

  // Verify authentication for protected routes
  const authResult = await verifyAuth(request)

  if (!authResult.authenticated) {
    return NextResponse.json(
      {
        success: false,
        error: authResult.error || 'Unauthorized',
      },
      { status: authResult.status }
    )
  }

  // Attach user info to request headers for use in route handlers
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', authResult.payload?.sub || '')
  requestHeaders.set('x-user-email', authResult.payload?.email || '')
  requestHeaders.set('x-user-role', authResult.payload?.role || '')

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: ['/api/:path*'],
}
```

### Step 4: Authentication Endpoints

#### Login (`app/api/auth/login/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createToken } from '@/lib/auth'

interface LoginRequest {
  email: string
  password: string
}

export async function POST(request: NextRequest) {
  try {
    const { email, password }: LoginRequest = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password required' },
        { status: 400 }
      )
    }

    // TODO: Replace with actual user database validation
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
    const adminPassword = process.env.ADMIN_PASSWORD || 'password'

    if (email !== adminEmail || password !== adminPassword) {
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    const token = await createToken({
      sub: email,
      email,
      role: 'admin',
    })

    return NextResponse.json(
      {
        success: true,
        token,
        user: { email, role: 'admin' },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 500 }
    )
  }
}
```

#### Verify Token (`app/api/auth/verify/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.authenticated) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          error: authResult.error,
        },
        { status: 401 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        authenticated: true,
        user: {
          email: authResult.payload!.email,
          role: authResult.payload!.role,
          sub: authResult.payload!.sub,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, authenticated: false, error: 'Verification failed' },
      { status: 500 }
    )
  }
}
```

### Step 5: Update Protected Routes

All protected routes follow this pattern. Example for `/api/alerts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
// ... other imports

export async function GET(request: NextRequest) {
  // Verify authentication FIRST
  const authResult = await verifyAuth(request)
  if (!authResult.authenticated) {
    return createUnauthorizedResponse(authResult.error || 'Authentication required')
  }

  // Your existing logic follows...
  // The middleware will also check, providing defense-in-depth
}

export async function POST(request: NextRequest) {
  const authResult = await verifyAuth(request)
  if (!authResult.authenticated) {
    return createUnauthorizedResponse(authResult.error || 'Authentication required')
  }

  // Your existing logic...
}
```

**Routes to update:**
- `/api/alerts/route.ts`
- `/api/brain/route.ts`
- `/api/conductor/route.ts`
- `/api/kanban/route.ts`
- `/api/meetings/route.ts`
- `/api/metrics/route.ts`
- `/api/profiles/route.ts`

**Note:** `/api/health/route.ts` remains public (no authentication required)

### Step 6: Environment Variables (`.env.example`)

```env
# Authentication
JWT_SECRET=your-very-secure-jwt-secret-key-min-32-chars-required
NEXTAUTH_SECRET=your-nextauth-secret-key-min-32-chars
NEXTAUTH_URL=http://localhost:3000

# Admin Credentials (Development only)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-in-production

# API Configuration
API_HEALTH_ENDPOINT=http://localhost:3000/api/health
```

### Step 7: Update `package.json`

Add dependencies:

```json
{
  "dependencies": {
    "jose": "^5.0.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "20.17.6",
    "@types/react": "18.3.31",
    "@types/react-dom": "^18.2.0",
    "typescript": "5.8.2"
  }
}
```

---

## 3. TESTING APPROACH

### Unit Tests (`lib/auth.test.ts`)

```typescript
import { createToken, verifyToken, getTokenFromRequest } from './auth'
import { NextRequest } from 'next/server'

describe('Auth Utils', () => {
  test('creates valid token', async () => {
    const token = await createToken({
      sub: 'user123',
      email: 'test@example.com',
      role: 'admin',
    })
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')
  })

  test('verifies valid token', async () => {
    const token = await createToken({
      sub: 'user123',
      email: 'test@example.com',
      role: 'admin',
    })
    const payload = await verifyToken(token)
    expect(payload?.email).toBe('test@example.com')
    expect(payload?.role).toBe('admin')
  })

  test('rejects invalid token', async () => {
    const payload = await verifyToken('invalid.token.here')
    expect(payload).toBeNull()
  })

  test('extracts token from Bearer header', () => {
    const req = new NextRequest(new URL('http://localhost'), {
      headers: { authorization: 'Bearer my-token' },
    })
    const token = getTokenFromRequest(req)
    expect(token).toBe('my-token')
  })

  test('returns null for missing header', () => {
    const req = new NextRequest(new URL('http://localhost'))
    const token = getTokenFromRequest(req)
    expect(token).toBeNull()
  })
})
```

### Integration Tests

Test all protected endpoints:

```typescript
describe('Protected API Endpoints', () => {
  let token: string

  beforeEach(async () => {
    // Login and get token
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'password',
      }),
    })
    const data = await response.json()
    token = data.token
  })

  test('GET /api/alerts with valid token', async () => {
    const response = await fetch('/api/alerts', {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(200)
  })

  test('GET /api/alerts without token returns 401', async () => {
    const response = await fetch('/api/alerts')
    expect(response.status).toBe(401)
  })

  test('POST /api/alerts with valid token', async () => {
    const response = await fetch('/api/alerts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        level: 'critical',
        component: 'test',
        message: 'test alert',
      }),
    })
    expect(response.status).toBe(201)
  })
})
```

---

## 4. CLIENT IMPLEMENTATION

### Fetch Wrapper

```typescript
// lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export async function apiCall<T>(
  endpoint: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...fetchOptions } = options

  const headers = new Headers(fetchOptions.headers || {})
  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...fetchOptions,
    headers,
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}

// Usage
const token = localStorage.getItem('authToken')
const alerts = await apiCall('/api/alerts', { token })
```

### React Hook

```typescript
// hooks/useAuth.ts
import { useState, useCallback } from 'react'

export function useAuth() {
  const [token, setToken] = useState<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('authToken') : null
  )

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) throw new Error('Login failed')

    const { token } = await response.json()
    localStorage.setItem('authToken', token)
    setToken(token)
    return token
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('authToken')
    setToken(null)
  }, [])

  return { token, login, logout, isAuthenticated: !!token }
}
```

---

## 5. DEPLOYMENT CHECKLIST

- [ ] Generate secure `JWT_SECRET` (min 32 chars): `openssl rand -base64 32`
- [ ] Set `JWT_SECRET` in production environment
- [ ] Remove hardcoded admin credentials; use proper user database
- [ ] Enable HTTPS in production (`NEXTAUTH_URL=https://domain.com`)
- [ ] Configure CORS if needed for cross-origin requests
- [ ] Set up token rotation/refresh logic
- [ ] Implement rate limiting on `/api/auth/login`
- [ ] Add audit logging for authentication events
- [ ] Test all protected endpoints in staging
- [ ] Add monitoring/alerts for failed auth attempts
- [ ] Document API authentication in developer guides

---

## 6. POTENTIAL SIDE EFFECTS

| Impact | Mitigation |
|--------|-----------|
| **Breaking change for existing clients** | Provide migration guide; support deprecated endpoints temporarily |
| **Health check becomes protected** | Keep `/api/health` public for monitoring |
| **Development experience** | Auto-generate test token in dev mode |
| **Performance overhead** | Token verification is O(1); minimal impact |
| **Token expiration** | Implement refresh token endpoint |
| **User lockout** | Support password reset flow |
| **Audit trail gaps** | Log authentication failures with details |

---

## 7. SUMMARY OF CHANGES

**New Files:**
- `lib/auth.ts` - Authentication utilities
- `lib/auth.test.ts` - Authentication tests
- `app/api/auth/login/route.ts` - Login endpoint
- `app/api/auth/verify/route.ts` - Token verification
- `middleware.ts` - Global auth middleware
- `.env.example` - Environment template

**Modified Files:**
- `app/api/alerts/route.ts` - Add auth checks
- `app/api/brain/route.ts` - Add auth checks
- `app/api/conductor/route.ts` - Add auth checks
- `app/api/kanban/route.ts` - Add auth checks
- `app/api/meetings/route.ts` - Add auth checks
- `app/api/metrics/route.ts` - Add auth checks
- `app/api/profiles/route.ts` - Add auth checks
- `package.json` - Add jose dependency

**Unchanged:**
- `app/api/health/route.ts` - Public endpoint
