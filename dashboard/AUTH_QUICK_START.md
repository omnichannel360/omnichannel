# JWT Authentication - Quick Start Guide

## Setup (One-Time)

### 1. Set Environment Variable

```bash
# Generate a secure JWT secret
openssl rand -base64 32
# Copy the output and set it

# On macOS/Linux
export JWT_SECRET="your-generated-secret-here"

# On Windows (PowerShell)
$env:JWT_SECRET="your-generated-secret-here"

# Or add to .env.local
echo "JWT_SECRET=your-generated-secret-here" > .env.local
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

## Quick Testing

### Method 1: cURL (Terminal)

```bash
# 1. Generate a test token
TOKEN=$(curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user","email":"test@example.com","role":"user"}' \
  | jq -r '.token')

# 2. Use token to call protected endpoint
curl -X GET http://localhost:3000/api/alerts \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK with alert data
```

### Method 2: JavaScript/Browser

```javascript
// 1. Get a token (via your auth endpoint or manually)
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

// 2. Make authenticated request
async function getAlerts() {
  const response = await fetch('http://localhost:3000/api/alerts', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  
  if (!response.ok) {
    console.error('Auth error:', response.status)
    return null
  }
  
  return response.json()
}

const alerts = await getAlerts()
console.log(alerts)
```

### Method 3: Postman

1. **Create new request**
   - Method: GET
   - URL: http://localhost:3000/api/alerts

2. **Add Authorization**
   - Go to "Authorization" tab
   - Type: Bearer Token
   - Token: (paste your JWT token)

3. **Send request**
   - Should return 200 OK with data

## Testing All Endpoints

```bash
TOKEN="your-jwt-token-here"
BASE_URL="http://localhost:3000"

# Test all protected endpoints
for endpoint in alerts brain conductor kanban meetings metrics profiles; do
  echo "Testing /api/$endpoint"
  curl -s -X GET "$BASE_URL/api/$endpoint" \
    -H "Authorization: Bearer $TOKEN" | jq '.success'
done
```

## Common Issues & Solutions

### Error: "Missing authentication token"
```
→ Add Authorization header: Bearer <token>
```

### Error: "Invalid token"
```
→ Token may be expired or malformed
→ Regenerate new token
```

### Error: 500 Internal Server Error
```
→ Check JWT_SECRET is set correctly
→ Verify token format (should be 3 parts separated by dots)
```

## Test Checklist

- [ ] Set JWT_SECRET environment variable
- [ ] Start dev server: `npm run dev`
- [ ] Generate a test token
- [ ] Test without token (should get 401)
- [ ] Test with valid token (should get 200)
- [ ] Test with invalid token (should get 401)
- [ ] Test all 8 endpoints with token
- [ ] Check token expiration (24 hours)

## Development Workflow

```bash
# 1. Start development server
npm run dev

# 2. In another terminal, test endpoints
TOKEN="eyJhbGc..." # your test token

# 3. Make requests
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/alerts

# 4. Check logs for any auth issues
# 5. Make code changes and test again
```

## Token Format

Every JWT has 3 parts separated by dots:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 . eyJzdWIiOiJ1c2VyLTEyMyJ9 . signature
|-- Header --|  |-- Payload --|  |-- Signature --|
```

Decode online: https://jwt.io

## Environment Variables Required

```
JWT_SECRET=<your-secret>        ← REQUIRED for token verification
NEXTAUTH_SECRET=<secret>         ← Optional for NextAuth
NEXTAUTH_URL=http://localhost:3000  ← Optional
```

## What's Protected?

| Endpoint | Auth Required |
|----------|---------------|
| GET /api/alerts | ✅ Yes |
| POST /api/alerts | ✅ Yes |
| GET /api/brain | ✅ Yes |
| GET /api/conductor | ✅ Yes |
| GET /api/health | ✅ Yes (currently) |
| GET /api/kanban | ✅ Yes |
| POST /api/meetings | ✅ Yes |
| GET /api/metrics | ✅ Yes |
| GET /api/profiles | ✅ Yes |

## Next Steps

1. ✅ Setup JWT_SECRET
2. ✅ Test endpoints with tokens
3. → Create auth endpoint for token generation
4. → Implement token refresh
5. → Add role-based access control
6. → Setup audit logging

---

**Need help?** See AUTH_IMPLEMENTATION.md for detailed documentation
