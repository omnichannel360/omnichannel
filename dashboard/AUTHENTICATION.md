# API Authentication Guide

## Overview

All API endpoints are protected with JWT (JSON Web Token) authentication. Clients must provide a valid JWT token in the `Authorization` header to access any API endpoint.

## Quick Start

### 1. Get an Access Token

Send a POST request to `/api/auth`:

```bash
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "email": "user@example.com",
    "role": "user"
  }'
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,
  "tokenType": "Bearer"
}
```

### 2. Use the Token

Include the token in all API requests:

```bash
curl -X GET http://localhost:3000/api/alerts \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Configuration

### Environment Variables

Create a `.env.local` file with:

```env
# Required: JWT secret (minimum 32 characters for production)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

Generate a secure secret:
```bash
openssl rand -base64 32
```

## Protected Endpoints

All of the following endpoints require authentication:

### Alerts API
- `GET /api/alerts` - List all alerts
- `POST /api/alerts` - Create alert
- `PATCH /api/alerts` - Update alert status

### Brain API
- `GET /api/brain` - Query company memory

### Conductor API
- `GET /api/conductor` - List conductor logs
- `POST /api/conductor` - Send message to conductor

### Health API
- `GET /api/health` - Check system health

### Kanban API
- `GET /api/kanban` - List tasks
- `POST /api/kanban` - Create task
- `PUT /api/kanban` - Update task
- `DELETE /api/kanban` - Delete task

### Meetings API
- `GET /api/meetings` - List meetings
- `POST /api/meetings` - Schedule meeting

### Metrics API
- `GET /api/metrics` - Get system metrics

### Profiles API
- `GET /api/profiles` - List agent profiles

## Error Responses

### 401 Unauthorized
Missing or invalid authentication token:
```json
{
  "error": "Missing or invalid authentication token",
  "success": false
}
```

### 403 Forbidden
Insufficient permissions:
```json
{
  "error": "Insufficient permissions",
  "success": false
}
```

### 500 Internal Server Error
Server-side error:
```json
{
  "error": "Error message",
  "success": false
}
```

## Token Lifecycle

### Access Token
- **Expiration**: 24 hours
- **Usage**: Include in `Authorization: Bearer <token>` header
- **Scope**: Full API access

### Refresh Token
- **Expiration**: 7 days
- **Usage**: Use to request new access token
- **Note**: Not currently implemented (future feature)

## Security Best Practices

1. **Never log tokens** - Tokens should not appear in logs or error messages
2. **Use HTTPS** - Always transmit tokens over encrypted connections
3. **Rotate secrets** - Change `JWT_SECRET` in production regularly
4. **Validate input** - All endpoints validate request payloads
5. **Handle errors** - Never expose sensitive data in error responses
6. **Token storage** - Store tokens securely on the client (httpOnly cookies preferred)

## Implementation Details

### How It Works

1. Client sends credentials to `/api/auth`
2. Server generates JWT token (valid for 24 hours)
3. Client includes token in subsequent requests
4. Server validates token using JWT verification
5. Request proceeds if token is valid, rejected if invalid/expired

### JWT Structure

```
Header.Payload.Signature

Header: { "alg": "HS256", "typ": "JWT" }
Payload: { "sub": "userId", "email": "user@email.com", "role": "user", "iat": ..., "exp": ... }
Signature: HMACSHA256(Header.Payload, secret)
```

### Verification Process

```typescript
import { verifyToken } from '@/lib/auth'

const user = await verifyToken(request)
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
// Continue with authenticated request
```

## Testing

### Unit Tests

Run authentication tests:
```bash
npm test -- lib/auth.test.ts
```

### Integration Tests

Test protected endpoints:
```bash
npm test -- __tests__/api/
```

### Manual Testing

Using cURL:
```bash
# Get token
TOKEN=$(curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"userId":"user123","email":"user@example.com"}' \
  | jq -r '.accessToken')

# Use token
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/alerts
```

## Troubleshooting

### "Missing authentication token"
- Check that `Authorization: Bearer <token>` header is included
- Verify token is in correct format (JWT)

### "Invalid or expired token"
- Token may have expired (24 hour limit)
- Secret may have changed
- Request new token from `/api/auth`

### "JWT_SECRET not configured"
- Add `JWT_SECRET` to `.env.local`
- Server will use fallback (insecure) if not set

## Future Enhancements

1. **Refresh token endpoint** - Automatically renew access tokens
2. **Role-based access control** - Different permissions per role
3. **Token revocation** - Blacklist compromised tokens
4. **Session management** - Track active sessions
5. **Multi-factor authentication** - Additional security layer

## Reference

- [JWT.io](https://jwt.io) - JWT standard
- [jsonwebtoken npm](https://www.npmjs.com/package/jsonwebtoken) - Implementation
- [Next.js API Routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes)
