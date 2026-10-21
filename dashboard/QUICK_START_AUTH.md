# Quick Start - Authentication

## 1. Configuration (5 minutes)

### Set JWT_SECRET
```bash
# .env or environment variables
JWT_SECRET=your-32-character-random-secret-key-here-123456
```

## 2. Get a Token (30 seconds)

```bash
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "email": "user@example.com",
    "role": "user"
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,
  "tokenType": "Bearer"
}
```

## 3. Use Token to Call Protected API (30 seconds)

```bash
curl -X GET http://localhost:3000/api/alerts \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response:**
```json
{
  "success": true,
  "alerts": [...],
  "total": 10
}
```

## 4. Test All Endpoints (2 minutes)

```bash
# Get token first
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","email":"test@example.com"}' | jq -r .accessToken)

# Test each endpoint
echo "Testing /api/alerts..."
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/alerts

echo "Testing /api/brain..."
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/brain

echo "Testing /api/conductor..."
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/conductor

echo "Testing /api/kanban..."
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/kanban

echo "Testing /api/meetings..."
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/meetings

echo "Testing /api/metrics..."
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/metrics

echo "Testing /api/profiles..."
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/profiles

echo "Testing /api/health (no auth needed)..."
curl http://localhost:3000/api/health
```

## 5. Run Tests (2 minutes)

```bash
# Unit tests
npm test -- auth.test.ts

# Integration tests
npm test -- middleware.test.ts

# All tests
npm test
```

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| "JWT_SECRET environment variable is not set" | Missing env var | Set JWT_SECRET |
| 401 Unauthorized | Missing token | Add `Authorization: Bearer {token}` header |
| 401 Unauthorized | Invalid token | Generate new token with /api/auth |
| 401 Unauthorized | Expired token | Token expires after 24 hours, get new one |

## Protected Routes

- ✅ `/api/alerts` - Get, create, update alerts
- ✅ `/api/brain` - Query company memory
- ✅ `/api/conductor` - Dispatch tasks & agents
- ✅ `/api/kanban` - Manage tasks & projects
- ✅ `/api/meetings` - Schedule & track meetings
- ✅ `/api/metrics` - Get business metrics
- ✅ `/api/profiles` - View agent profiles

## Public Routes

- 🔓 `/api/health` - Health check (no token needed)
- 🔓 `/api/auth` - Get tokens

## Frontend Integration

```javascript
// 1. Get token on login
async function login(userId, email) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, email, role: 'user' })
  })
  const { accessToken } = await res.json()
  localStorage.setItem('authToken', accessToken)
}

// 2. Use token on protected API calls
async function callProtectedAPI(endpoint) {
  const token = localStorage.getItem('authToken')
  const res = await fetch(endpoint, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  return res.json()
}

// 3. Get data from protected endpoint
const alerts = await callProtectedAPI('/api/alerts')
```

## Production Checklist

- [ ] Set JWT_SECRET environment variable
- [ ] Enable HTTPS
- [ ] Configure CORS
- [ ] Run all tests
- [ ] Deploy to production
- [ ] Monitor auth failures
- [ ] Set up token refresh

## Support

- See `AUTHENTICATION_IMPLEMENTATION.md` for detailed guide
- See `AUTH_VERIFICATION_REPORT.md` for verification details
- Run tests: `npm test`
- Check logs: `npm run dev`

---

**Ready?** Set `JWT_SECRET` and start testing! 🚀
