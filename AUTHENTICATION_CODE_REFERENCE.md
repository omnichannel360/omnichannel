# Authentication Implementation - Code Reference

Complete code snippets and implementation details for JWT authentication across all API endpoints.

---

## Core Authentication Library

### File: `/lib/auth.ts`

```typescript
import { NextRequest } from 'next/server'
import jwt, { JwtPayload } from 'jsonwebtoken'

// CRITICAL: JWT_SECRET must be set in environment
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is not set. ' +
    'This is required for authentication to function securely.'
  )
}

/**
 * Token payload structure
 */
export interface TokenPayload extends JwtPayload {
  sub: string       // User ID
  email: string     // User email
  role: string      // User role
  iat: number       // Issued at timestamp
  exp: number       // Expiration timestamp
}

/**
 * Verify JWT token from request headers
 * Returns null if token is invalid or missing
 */
export async function verifyToken(request: NextRequest): Promise<TokenPayload | null> {
  try {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload
    
    return decoded
  } catch (error) {
    return null
  }
}

/**
 * Generate JWT access token
 */
export async function generateToken(
  userId: string,
  email: string,
  role: string = 'user',
  expiresIn: number = 24 * 60 * 60 // 24 hours default
): Promise<string> {
  const token = jwt.sign(
    {
      sub: userId,
      email,
      role,
    },
    JWT_SECRET,
    { expiresIn }
  )

  return token
}

/**
 * Generate refresh token with longer expiration
 */
export async function generateRefreshToken(
  userId: string,
  email: string,
  expiresIn: number = 7 * 24 * 60 * 60 // 7 days default
): Promise<string> {
  const token = jwt.sign(
    {
      sub: userId,
      email,
      type: 'refresh',
    },
    JWT_SECRET,
    { expiresIn }
  )

  return token
}

/**
 * Helper for verifying auth in API routes
 */
export async function verifyAuth(request: NextRequest): Promise<{ 
  authenticated: boolean
  error?: string
  payload?: TokenPayload 
}> {
  const token = await verifyToken(request)
  if (!token) {
    return { authenticated: false, error: 'Missing or invalid authentication token' }
  }
  return { authenticated: true, payload: token }
}

/**
 * Create unauthorized response
 */
export function createUnauthorizedResponse(error: string): Response {
  return new Response(JSON.stringify({ error, success: false }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Authentication error responses
 */
export const AuthErrors = {
  MISSING_TOKEN: { status: 401, message: 'Missing authentication token' },
  INVALID_TOKEN: { status: 401, message: 'Invalid or expired token' },
  FORBIDDEN: { status: 403, message: 'Insufficient permissions' },
  UNAUTHORIZED: { status: 401, message: 'Unauthorized request' },
} as const
```

---

## Middleware

### File: `/lib/middleware.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, AuthErrors } from './auth'

/**
 * Middleware to protect API routes with JWT authentication
 * Usage: Wrap your API route handler with this middleware
 */
export async function protectRoute(
  request: NextRequest,
  handler: (req: NextRequest, user: any) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const user = await verifyToken(request)

    if (!user) {
      return NextResponse.json(
        { error: AuthErrors.MISSING_TOKEN.message },
        { status: AuthErrors.MISSING_TOKEN.status }
      )
    }

    return await handler(request, user)
  } catch (error) {
    console.error('[Auth Middleware Error]', error)
    return NextResponse.json(
      { error: AuthErrors.UNAUTHORIZED.message },
      { status: AuthErrors.UNAUTHORIZED.status }
    )
  }
}

/**
 * Middleware for optional authentication
 * Attaches user if token is valid, but doesn't fail without one
 */
export async function protectRouteOptional(
  request: NextRequest,
  handler: (req: NextRequest, user?: any) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const user = await verifyToken(request)
    return await handler(request, user || undefined)
  } catch (error) {
    console.error('[Auth Middleware Error]', error)
    return NextResponse.json(
      { error: AuthErrors.UNAUTHORIZED.message },
      { status: AuthErrors.UNAUTHORIZED.status }
    )
  }
}
```

---

## Protected API Endpoint Pattern

### Standard Protected Endpoint

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'

/**
 * GET /api/alerts
 * Returns alerts for authenticated user
 */
export async function GET(request: NextRequest) {
  // 1. Verify authentication
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  // 2. Access user information from token
  const userId = auth.payload?.sub
  const userEmail = auth.payload?.email
  const userRole = auth.payload?.role

  // 3. Business logic
  try {
    const alerts = loadAlerts()
    const activeOnly = request.nextUrl.searchParams.get('active') === 'true'

    return NextResponse.json({
      success: true,
      alerts: activeOnly ? alerts.filter(a => a.status === 'active') : alerts,
      total: alerts.length,
      userId, // Include user info if needed
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to load alerts' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/alerts
 * Create new alert
 */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  try {
    const { level, component, message } = await request.json()

    if (!level || !component || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const alert = createAlert(level, component, message)
    const alerts = loadAlerts()
    alerts.push(alert)
    saveAlerts(alerts)

    return NextResponse.json({ success: true, alert }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to create alert' },
      { status: 500 }
    )
  }
}
```

---

## All Protected Endpoints Implementation

### 1. `/api/alerts/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const alerts = loadAlerts()
  const activeOnly = request.nextUrl.searchParams.get('active') === 'true'

  return NextResponse.json({
    success: true,
    alerts: activeOnly ? alerts.filter(a => a.status === 'active') : alerts,
    total: alerts.length,
  })
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const { level, component, message } = await request.json()
  if (!level || !component || !message) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
  }

  const alert = createAlert(level, component, message)
  const alerts = loadAlerts()
  alerts.push(alert)
  saveAlerts(alerts)

  return NextResponse.json({ success: true, alert }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  const { alert_id, status } = await request.json()
  if (!alert_id || !status) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
  }

  const alerts = loadAlerts()
  const alert = alerts.find(a => a.id === alert_id)

  if (!alert) {
    return NextResponse.json({ success: false, error: 'Alert not found' }, { status: 404 })
  }

  alert.status = status
  saveAlerts(alerts)

  return NextResponse.json({ success: true, alert })
}
```

### 2. `/api/brain/route.ts`

```typescript
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  try {
    // Business logic here
    const brainData = getBrainData()
    return NextResponse.json({ success: true, data: brainData })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to query brain' }, { status: 500 })
  }
}
```

### 3-8. Other Endpoints

All follow the same pattern:

**`/api/conductor/route.ts`** - GET, POST protected  
**`/api/health/route.ts`** - GET protected  
**`/api/kanban/route.ts`** - GET, POST, PUT, DELETE all protected  
**`/api/meetings/route.ts`** - GET, POST protected  
**`/api/metrics/route.ts`** - GET protected  
**`/api/profiles/route.ts`** - GET protected  

---

## Public Endpoint (No Auth)

### File: `/api/auth/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { generateToken, generateRefreshToken } from '@/lib/auth'

/**
 * POST /api/auth
 * Generate authentication tokens for API access
 * 
 * This endpoint is PUBLIC - no authentication required
 * 
 * @body { userId: string, email: string, role?: string }
 * @returns { accessToken: string, refreshToken: string, expiresIn: number }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, email, role = 'user' } = await request.json()

    // Validate input
    if (!userId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, email' },
        { status: 400 }
      )
    }

    // Generate tokens
    const accessToken = await generateToken(userId, email, role, 24 * 60 * 60) // 24 hours
    const refreshToken = await generateRefreshToken(userId, email, 7 * 24 * 60 * 60) // 7 days

    return NextResponse.json({
      accessToken,
      refreshToken,
      expiresIn: 24 * 60 * 60, // 24 hours in seconds
      tokenType: 'Bearer',
    })
  } catch (error) {
    console.error('[Auth Endpoint Error]', error)
    return NextResponse.json(
      { error: 'Failed to generate tokens' },
      { status: 500 }
    )
  }
}
```

---

## Unit Tests

### File: `__tests__/auth.test.ts`

```typescript
import { verifyToken, generateToken, verifyAuth } from '@/lib/auth'
import { NextRequest } from 'next/server'

describe('Authentication Module', () => {
  const testPayload = {
    userId: 'test-user-123',
    email: 'test@example.com',
    role: 'admin',
  }

  describe('generateToken', () => {
    it('should generate a valid JWT token', async () => {
      const token = await generateToken(
        testPayload.userId,
        testPayload.email,
        testPayload.role
      )
      expect(token).toBeDefined()
      expect(token.split('.').length).toBe(3) // JWT format
    })

    it('should encode correct payload information', async () => {
      const token = await generateToken(
        testPayload.userId,
        testPayload.email,
        testPayload.role
      )
      const verified = await verifyToken(
        new NextRequest(new URL('http://localhost'), {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      expect(verified?.sub).toBe(testPayload.userId)
      expect(verified?.email).toBe(testPayload.email)
      expect(verified?.role).toBe(testPayload.role)
    })
  })

  describe('verifyToken', () => {
    it('should return null for missing authorization header', async () => {
      const req = new NextRequest(new URL('http://localhost'))
      const result = await verifyToken(req)
      expect(result).toBeNull()
    })

    it('should return token payload for valid token', async () => {
      const token = await generateToken(
        testPayload.userId,
        testPayload.email,
        testPayload.role
      )
      const req = new NextRequest(new URL('http://localhost'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await verifyToken(req)
      expect(result).toBeDefined()
      expect(result?.sub).toBe(testPayload.userId)
    })
  })

  describe('verifyAuth', () => {
    it('should return authenticated: false for missing token', async () => {
      const req = new NextRequest(new URL('http://localhost'))
      const result = await verifyAuth(req)
      expect(result.authenticated).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should return authenticated: true with payload for valid token', async () => {
      const token = await generateToken(
        testPayload.userId,
        testPayload.email,
        testPayload.role
      )
      const req = new NextRequest(new URL('http://localhost'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await verifyAuth(req)
      expect(result.authenticated).toBe(true)
      expect(result.payload).toBeDefined()
      expect(result.payload?.sub).toBe(testPayload.userId)
    })
  })
})
```

---

## Client Integration Examples

### React Component

```typescript
import { useState, useEffect } from 'react'

interface AuthContextType {
  token: string | null
  user: { userId: string; email: string } | null
  authenticate: (userId: string, email: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

export const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<{ userId: string; email: string } | null>(null)

  const authenticate = async (userId: string, email: string) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email }),
      })

      if (!res.ok) throw new Error('Auth failed')

      const { accessToken } = await res.json()
      setToken(accessToken)
      setUser({ userId, email })

      // Store token (optional, use secure storage in production)
      sessionStorage.setItem('auth_token', accessToken)
    } catch (error) {
      console.error('Authentication failed:', error)
      throw error
    }
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    sessionStorage.removeItem('auth_token')
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        authenticate,
        logout,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// Usage in component
export function AlertsList() {
  const auth = useContext(AuthContext)
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    if (!auth?.token) return

    fetch('/api/alerts', {
      headers: {
        'Authorization': `Bearer ${auth.token}`,
      },
    })
      .then(res => {
        if (res.status === 401) {
          auth.logout()
          throw new Error('Session expired')
        }
        return res.json()
      })
      .then(data => setAlerts(data.alerts))
      .catch(error => console.error('Failed to load alerts:', error))
  }, [auth?.token])

  return (
    <div>
      {alerts.map(alert => (
        <div key={alert.id}>{alert.message}</div>
      ))}
    </div>
  )
}
```

### API Client Utility

```typescript
export class APIClient {
  private token: string | null = null
  private baseUrl: string

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl
    this.token = sessionStorage.getItem('auth_token')
  }

  async authenticate(userId: string, email: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, email }),
    })

    if (!res.ok) throw new Error('Authentication failed')

    const { accessToken } = await res.json()
    this.token = accessToken
    sessionStorage.setItem('auth_token', accessToken)
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.token) throw new Error('Not authenticated')

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    })

    if (res.status === 401) {
      this.token = null
      sessionStorage.removeItem('auth_token')
      throw new Error('Session expired')
    }

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Request failed')
    }

    return res.json()
  }

  async getAlerts() {
    return this.request('/api/alerts')
  }

  async createAlert(level: string, component: string, message: string) {
    return this.request('/api/alerts', {
      method: 'POST',
      body: JSON.stringify({ level, component, message }),
    })
  }
}

// Usage
const client = new APIClient()
await client.authenticate('user-123', 'user@example.com')
const alerts = await client.getAlerts()
```

---

## cURL Examples

### Generate Token

```bash
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "email": "user@example.com",
    "role": "admin"
  }'

# Response:
# {
#   "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "expiresIn": 86400,
#   "tokenType": "Bearer"
# }
```

### Use Token in Request

```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/alerts

# Response:
# {
#   "success": true,
#   "alerts": [...],
#   "total": 42
# }
```

### Create Alert with Auth

```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X POST http://localhost:3000/api/alerts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "level": "warning",
    "component": "api-server",
    "message": "High memory usage detected"
  }'
```

---

## Environment Configuration

### `.env` (Development)

```env
# Required
JWT_SECRET=dev-secret-key-minimum-32-characters

# Optional overrides
# JWT_EXPIRY=24h
# JWT_REFRESH_EXPIRY=7d
```

### Deployment (Production)

```bash
# Generate secure random secret
JWT_SECRET=$(openssl rand -hex 32)
export JWT_SECRET

# Start application
npm start
```

---

## Debugging & Troubleshooting

### Debug Token

```bash
# Decode JWT token (online tools)
# https://jwt.io

# Or use Node.js
node -e "console.log(JSON.stringify(require('jsonwebtoken').decode('TOKEN_HERE'), null, 2))"
```

### Check Token Validity

```bash
curl -X GET http://localhost:3000/api/alerts \
  -H "Authorization: Bearer invalid-token"

# Should return 401:
# {"error": "Invalid or expired token", "success": false}
```

### Verify Secret Configuration

```bash
# Check if JWT_SECRET is set
echo $JWT_SECRET

# If empty, set it
export JWT_SECRET="your-secret-here"
```

---

## Configuration Checklist

- [ ] `JWT_SECRET` environment variable set
- [ ] All endpoints import `verifyAuth` and `createUnauthorizedResponse`
- [ ] All protected handlers check `auth.authenticated`
- [ ] Clients updated to generate and send tokens
- [ ] Tests added for authentication
- [ ] Error handling for 401 responses
- [ ] Token generation tested manually
- [ ] Health monitoring setup
- [ ] Documentation updated

---

This reference covers all code needed for authentication implementation.
