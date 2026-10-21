# API Authentication Implementation Guide

## Overview

All API endpoints now require JWT authentication via Bearer token in the Authorization header. This guide covers implementation details, testing, deployment, and troubleshooting.

---

## Quick Start

### For API Consumers

Include authorization header in all requests:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/alerts
```

### For Backend Integration

```typescript
import { generateToken } from '@/lib/auth'

// Generate token
const token = await generateToken('user-id', 'user@example.com', 'admin')

// Use in requests
const response = await fetch('/api/alerts', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

---

## Architecture

### Authentication Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ 1. POST /api/auth (generate token)
       ↓
┌─────────────────────┐
│  Auth Endpoint      │
│  (generates JWT)    │
└──────┬──────────────┘
       │ 2. Returns accessToken + refreshToken
       ↓
┌─────────────┐
│   Client    │
│  (stores    │
│   token)    │
└──────┬──────┘
       │ 3. GET /api/alerts + Authorization header
       ↓
┌──────────────────────────┐
│  API Endpoint Handler    │
│  ├─ Extract token        │
│  ├─ Verify JWT signature │
│  ├─ Check expiration     │
│  └─ Proceed/Reject       │
└──────────────────────────┘
```

### Components

#### 1. Auth Library (`/lib/auth.ts`)

Core authentication utilities:

```typescript
// Generate access token (24 hours default)
generateToken(userId, email, role): Promise<string>

// Generate refresh token (7 days default)  
generateRefreshToken(userId, email): Promise<string>

// Verify token from request
verifyToken(request): Promise<TokenPayload | null>

// Check authentication in route
verifyAuth(request): Promise<{authenticated, payload?, error?}>

// Create error response
createUnauthorizedResponse(message): Response
```

#### 2. Middleware (`/lib/middleware.ts`)

Route protection helpers:

```typescript
// Require authentication - rejects if no valid token
protectRoute(request, handler)

// Optional authentication - proceeds with or without token
protectRouteOptional(request, handler)
```

#### 3. API Routes

All endpoints follow the pattern:

```typescript
export async function GET(request: NextRequest) {
  // 1. Verify authentication
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error!)
  }

  // 2. Access user info from token
  const userId = auth.payload?.sub
  const userEmail = auth.payload?.email
  const userRole = auth.payload?.role

  // 3. Continue with business logic
  // ...
}
```

---

## Protected Endpoints

All these endpoints now require valid JWT:

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/api/alerts` | GET, POST, PATCH | Alert management |
| `/api/brain` | GET | Company memory/knowledge |
| `/api/conductor` | GET, POST | Task orchestration |
| `/api/health` | GET | System health check |
| `/api/kanban` | GET, POST, PUT, DELETE | Task board |
| `/api/meetings` | GET, POST | Meeting scheduling |
| `/api/metrics` | GET | Performance metrics |
| `/api/profiles` | GET | Agent profiles |

**Public Endpoint:**
| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/api/auth` | POST | Token generation (NO AUTH REQUIRED) |

---

## Token Structure

### Token Payload

```typescript
interface TokenPayload {
  sub: string           // User ID
  email: string         // User email
  role: string          // User role (admin, user, etc.)
  iat: number           // Issued at (timestamp)
  exp: number           // Expiration time (timestamp)
}
```

### Sample Decoded Token

```json
{
  "sub": "user-12345",
  "email": "user@example.com",
  "role": "admin",
  "iat": 1698123456,
  "exp": 1698209856
}
```

---

## Configuration

### Environment Variables

```env
# Required in production
JWT_SECRET=your-very-secure-secret-key-change-in-production

# Optional (defaults shown)
# JWT_EXPIRY=24h
# JWT_REFRESH_EXPIRY=7d
```

### Security Best Practices

1. **Secret Management**
   - Never commit `.env` to version control
   - Use strong, random secrets (minimum 32 characters)
   - Rotate secrets periodically
   - Use environment variables in production

2. **Token Expiration**
   - Access tokens: 24 hours (default)
   - Refresh tokens: 7 days (default)
   - Adjust based on security requirements

3. **HTTPS Only**
   - Always transmit tokens over HTTPS
   - Never log tokens to console/files
   - Don't expose tokens in URLs

---

## Testing

### Running Tests

```bash
# Unit tests
npm test -- auth.test.ts

# Integration tests
npm test -- api-auth-integration.test.ts

# All tests
npm test
```

### Test Coverage

**Unit Tests** (`__tests__/auth.test.ts`):
- Token generation and validation
- Payload encoding/decoding
- Error handling for missing/invalid tokens
- Default role assignment
- Token expiration

**Integration Tests** (`__tests__/api-auth-integration.test.ts`):
- 401 response without token
- 200 response with valid token
- Token payload validation
- Error responses for all endpoints
- Invalid token rejection

### Manual Testing

#### 1. Generate Token

```bash
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "email": "user@example.com",
    "role": "admin"
  }'

# Response
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,
  "tokenType": "Bearer"
}
```

#### 2. Use Token in Request

```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/alerts

# Response (200 OK)
{
  "success": true,
  "alerts": [...],
  "total": 42
}
```

#### 3. Test Without Token

```bash
curl http://localhost:3000/api/alerts

# Response (401 Unauthorized)
{
  "error": "Missing or invalid authentication token",
  "success": false
}
```

---

## Error Responses

### 401 Unauthorized

Missing or invalid token:

```json
{
  "error": "Missing or invalid authentication token",
  "success": false
}
```

### 403 Forbidden

Valid token but insufficient permissions (future use):

```json
{
  "error": "Insufficient permissions",
  "success": false
}
```

### 400 Bad Request

Invalid request body:

```json
{
  "error": "Missing required fields",
  "success": false
}
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] Generate strong JWT_SECRET for production
- [ ] Review environment variables
- [ ] Run full test suite
- [ ] Update API documentation
- [ ] Notify API consumers
- [ ] Prepare rollback plan

### Deployment

- [ ] Set JWT_SECRET in production environment
- [ ] Verify tokens are generated correctly
- [ ] Test authenticated requests
- [ ] Monitor error logs for auth failures
- [ ] Verify health check functionality

### Post-Deployment

- [ ] Monitor 401 error rates
- [ ] Check token generation performance
- [ ] Verify no auth-related issues in logs
- [ ] Confirm all endpoints are protected
- [ ] Update monitoring/alerting rules

---

## Troubleshooting

### Common Issues

#### "Missing or invalid authentication token"

**Cause:** No Authorization header or incorrect format

**Solution:**
```bash
# Wrong
curl http://localhost:3000/api/alerts

# Correct
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/alerts
```

#### "Invalid or expired token"

**Cause:** Token has expired or was tampered with

**Solution:**
1. Generate a new token from `/api/auth`
2. Check JWT_SECRET is consistent
3. Verify client clock is synchronized

#### "ENOENT: no such file or directory JWT_SECRET"

**Cause:** Environment variable not set

**Solution:**
```bash
# In .env file
JWT_SECRET=your-secret-key

# Or in deployment
export JWT_SECRET=your-secret-key
```

#### High 401 Error Rates

**Cause:** Client code not sending tokens correctly

**Solution:**
1. Review request headers in client
2. Verify token generation works
3. Check token is being stored/transmitted
4. Add request logging for debugging

---

## Migration Guide

### For Existing API Consumers

If your app was calling these endpoints without auth:

#### Before

```javascript
const response = await fetch('/api/alerts')
```

#### After

```javascript
// 1. Get token
const tokenResponse = await fetch('/api/auth', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'your-user-id',
    email: 'user@example.com'
  })
})
const { accessToken } = await tokenResponse.json()

// 2. Use token in subsequent requests
const response = await fetch('/api/alerts', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
})
```

#### Or Better - Auth Manager Utility

```typescript
class AuthManager {
  token: string | null = null

  async initialize(userId: string, email: string) {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, email })
    })
    const { accessToken } = await res.json()
    this.token = accessToken
  }

  async fetch(path: string, options: RequestInit = {}) {
    return fetch(path, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.token}`
      }
    })
  }
}

// Usage
const auth = new AuthManager()
await auth.initialize('user-123', 'user@example.com')
const response = await auth.fetch('/api/alerts')
```

---

## Performance Considerations

### Token Verification Performance

- **Verification Time:** ~1-2ms per request
- **Cache:** Tokens are not cached; verified on each request
- **Optimization:** Can implement token caching with TTL if needed

### Database Queries

- No database queries required for token verification
- All validation is cryptographic (CPU-bound)
- Scales linearly with request volume

### Recommendations

1. Use connection pooling for database operations
2. Implement request caching where possible
3. Monitor token verification latency
4. Consider token caching for high-traffic scenarios

---

## Security Auditing

### Logging

Log all authentication events (optional enhancement):

```typescript
console.log({
  timestamp: new Date(),
  event: 'auth_success',
  userId: payload.sub,
  endpoint: request.nextUrl.pathname,
})

console.log({
  timestamp: new Date(),
  event: 'auth_failure',
  reason: 'invalid_token',
  endpoint: request.nextUrl.pathname,
})
```

### Monitoring Alerts

Set up alerts for:
- High rate of 401 errors
- Unusual token generation patterns
- Token expiration mismatches

### Security Headers

Add security headers to all responses:

```typescript
// In middleware or next.config.js
response.headers.set('X-Content-Type-Options', 'nosniff')
response.headers.set('X-Frame-Options', 'DENY')
response.headers.set('Strict-Transport-Security', 'max-age=31536000')
```

---

## Future Enhancements

### Planned Improvements

1. **Token Refresh Flow**
   - Implement refresh token endpoint
   - Auto-refresh expired tokens
   - Revoke compromised tokens

2. **Role-Based Access Control**
   - Restrict endpoints by role
   - Implement permission checking
   - Create admin-only endpoints

3. **API Key Support**
   - Support service-to-service auth
   - Implement key rotation
   - Add key revocation

4. **Audit Logging**
   - Log all auth events
   - Track token usage
   - Implement audit dashboard

5. **Rate Limiting**
   - Limit token generation attempts
   - Prevent brute force attacks
   - Implement per-user limits

---

## Support & Questions

For issues or questions:
1. Check troubleshooting section
2. Review test cases for examples
3. Check error response in console
4. Verify environment configuration
5. Contact security team for sensitive issues

---

## Changelog

### v1.0 (October 2024)

- Initial implementation
- JWT-based authentication
- All endpoints protected
- Comprehensive testing
- Full documentation
