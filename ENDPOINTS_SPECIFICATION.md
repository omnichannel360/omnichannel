# Complete API Endpoints Specification

## Authentication Endpoints (NEW)

### POST `/api/auth/login`
- **Authentication:** None (public)
- **Purpose:** Generate JWT token
- **Request Body:**
  ```json
  {
    "email": "admin@example.com",
    "password": "password"
  }
  ```
- **Response (200):**
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "email": "admin@example.com",
      "role": "admin"
    }
  }
  ```
- **Error (401):**
  ```json
  {
    "success": false,
    "error": "Invalid credentials"
  }
  ```

### GET `/api/auth/verify`
- **Authentication:** Required (Bearer token)
- **Purpose:** Verify current token validity
- **Response (200):**
  ```json
  {
    "success": true,
    "authenticated": true,
    "user": {
      "email": "admin@example.com",
      "role": "admin",
      "sub": "admin@example.com"
    }
  }
  ```
- **Error (401):**
  ```json
  {
    "success": false,
    "authenticated": false,
    "error": "Invalid or expired token"
  }
  ```

---

## Protected Endpoints (All require Bearer token)

### `/api/alerts`

**GET** - Retrieve alerts
- **Auth:** Required
- **Params:** `?active=true` (optional - filter active alerts)
- **Response (200):**
  ```json
  {
    "success": true,
    "alerts": [...],
    "total": 5
  }
  ```

**POST** - Create new alert
- **Auth:** Required
- **Body:**
  ```json
  {
    "level": "critical",
    "component": "api",
    "message": "High error rate detected"
  }
  ```
- **Response (201):**
  ```json
  {
    "success": true,
    "alert": {
      "id": "alert_1729612345",
      "timestamp": "2024-10-21T...",
      "level": "critical",
      "component": "api",
      "message": "High error rate detected",
      "status": "active"
    }
  }
  ```

**PATCH** - Update alert status
- **Auth:** Required
- **Body:**
  ```json
  {
    "alert_id": "alert_1729612345",
    "status": "resolved"
  }
  ```
- **Response (200):** Updated alert object

---

### `/api/brain`

**GET** - Retrieve company brain data
- **Auth:** Required
- **Response (200):**
  ```json
  {
    "success": true,
    "meetings": [...],
    "decisions": [...],
    "outcomes": [...]
  }
  ```

**POST** - Log new decision/outcome
- **Auth:** Required
- **Body:** Domain-specific decision data
- **Response (201):** Created record

**PATCH** - Update existing record
- **Auth:** Required
- **Body:** Updated fields
- **Response (200):** Updated record

---

### `/api/conductor`

**GET** - Retrieve conductor/orchestration state
- **Auth:** Required
- **Response (200):**
  ```json
  {
    "success": true,
    "orchestrations": [...],
    "activeWorkflows": [...]
  }
  ```

**POST** - Start new orchestration
- **Auth:** Required
- **Body:** Orchestration config
- **Response (201):** Created orchestration

**PUT** - Replace orchestration state
- **Auth:** Required
- **Body:** Full orchestration config
- **Response (200):** Updated state

---

### `/api/kanban`

**GET** - Retrieve kanban board state
- **Auth:** Required
- **Response (200):**
  ```json
  {
    "success": true,
    "board": {
      "todo": [...],
      "inProgress": [...],
      "done": [...]
    }
  }
  ```

**POST** - Create new kanban card
- **Auth:** Required
- **Body:**
  ```json
  {
    "title": "Task name",
    "description": "Details",
    "column": "todo"
  }
  ```
- **Response (201):** Created card

**PATCH** - Update card (move, update)
- **Auth:** Required
- **Body:** Card updates
- **Response (200):** Updated card

---

### `/api/meetings`

**GET** - Retrieve meetings
- **Auth:** Required
- **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "meetings": [...],
      "recentLogs": [...]
    },
    "meta": {
      "total_meetings": 5,
      "recent_logs": 10
    }
  }
  ```

**POST** - Schedule/log meeting
- **Auth:** Required
- **Body:**
  ```json
  {
    "message": "Daily standup",
    "meeting_type": "standup",
    "participants": ["user1", "user2"]
  }
  ```
- **Response (200):**
  ```json
  {
    "success": true,
    "response": "Meeting logged and skill triggered",
    "meeting_type": "standup",
    "skill_triggered": "daily-sync"
  }
  ```

---

### `/api/metrics`

**GET** - Retrieve metrics/analytics
- **Auth:** Required
- **Response (200):**
  ```json
  {
    "success": true,
    "metrics": {
      "uptime": 99.9,
      "successRate": 98.5,
      "avgResponseTime": 125
    }
  }
  ```

**POST** - Record new metric
- **Auth:** Required
- **Body:**
  ```json
  {
    "metric": "api_latency",
    "value": 125,
    "timestamp": "2024-10-21T..."
  }
  ```
- **Response (201):** Recorded metric

---

### `/api/profiles`

**GET** - Retrieve user/profiles
- **Auth:** Required
- **Response (200):**
  ```json
  {
    "success": true,
    "profiles": [...]
  }
  ```

**POST** - Create new profile
- **Auth:** Required
- **Body:**
  ```json
  {
    "name": "User Name",
    "email": "user@example.com",
    "role": "user"
  }
  ```
- **Response (201):** Created profile

**PATCH** - Update profile
- **Auth:** Required
- **Body:** Profile updates
- **Response (200):** Updated profile

---

## Public Endpoints (No authentication required)

### GET `/api/health`
- **Purpose:** System health check
- **No auth required** - for monitoring/external checks
- **Response (200/503):**
  ```json
  {
    "status": "healthy",
    "timestamp": "2024-10-21T...",
    "components": {
      "meetings_api": {"status": "operational", "response_time_ms": 45},
      "conductor_api": {"status": "operational", "response_time_ms": 0},
      "company_brain": {"status": "logging", "log_count": 42, "latest_timestamp": "..."},
      "skill_registry": {"status": "loaded", "skill_count": 12}
    },
    "metrics": {...},
    "alerts": []
  }
  ```

---

## Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Missing or invalid authorization header"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Insufficient permissions"
}
```

### 400 Bad Request
```json
{
  "success": false,
  "error": "Missing required fields"
}
```

### 500 Internal Error
```json
{
  "success": false,
  "error": "Operation failed"
}
```

---

## Request Headers

### Required for All Protected Endpoints
```
Authorization: Bearer <jwt_token>
Content-Type: application/json (for POST/PATCH/PUT)
```

### Optional
```
X-Request-ID: <correlation-id> (for logging)
User-Agent: <client-identifier>
```

---

## Rate Limiting (Future Implementation)

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1729612345
```

---

## Example Client Usage

### JavaScript/TypeScript
```typescript
const token = localStorage.getItem('authToken')

// Fetch alerts
const response = await fetch('/api/alerts', {
  headers: {
    'Authorization': `Bearer ${token}`,
  }
})
const data = await response.json()
```

### cURL
```bash
TOKEN="eyJhbGciOiJIUzI1NiIs..."
curl http://localhost:3000/api/alerts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

### Python
```python
import requests

token = "eyJhbGciOiJIUzI1NiIs..."
headers = {"Authorization": f"Bearer {token}"}
response = requests.get("http://localhost:3000/api/alerts", headers=headers)
```

---

## Migration Path for Existing Clients

1. **Phase 1:** Deploy authentication (this change)
2. **Phase 2:** Update clients to send Authorization header
3. **Phase 3:** (Optional) Deprecate old endpoints
4. **Phase 4:** Remove old endpoints

Current status: Phase 1 (authentication deployed)
