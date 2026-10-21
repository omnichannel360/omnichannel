# SECURITY AUDIT ACTION PLAN
## OmniCompany Dashboard - Remediation Guide
**Date:** 2026-10-22  
**Priority:** CRITICAL - Production Deployment Blocker  
**Timeline:** 6-9 hours for complete remediation

---

## CRITICAL ISSUES (Deploy Blocking)

### 1. Cryptographic Implementation - Removed crypto.randomUUID() Check

**Issue:** `dashboard/lib/crypto-utils.ts` no longer checks for Node.js native `crypto.randomUUID()`

**Current Code:**
```typescript
// dashboard/lib/crypto-utils.ts (DEGRADED)
export { generateUUIDv4, generateId, generatePrefixedId } from './uuid'

// dashboard/lib/uuid.ts - Only checks globalThis.crypto
if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
  // Uses browser-level crypto, not Node.js native
}
```

**What's Missing:**
Node.js 15+ provides `crypto.randomUUID()` which is:
- Native C++ implementation (faster)
- Cryptographically secure (OS-level entropy)
- No fallback needed on Node.js

**Required Fix:**

Edit `dashboard/lib/uuid.ts` - restore Node.js native check:

```typescript
export function generateUUIDv4(): string {
  // PRIORITY 1: Check Node.js native (fastest, most secure)
  if (typeof require !== 'undefined') {
    try {
      const { randomUUID } = require('crypto')
      return randomUUID()
    } catch {
      // Fall through to globalThis.crypto
    }
  }

  // PRIORITY 2: Use browser/universal crypto.getRandomValues
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const array = new Uint8Array(16)
    globalThis.crypto.getRandomValues(array)
    // ... rest of implementation
  }

  // PRIORITY 3: Fallback (non-secure, development only)
  const fallbackLogger = getLogger()
  if (fallbackLogger) {
    fallbackLogger.warn('[SECURITY] generateUUIDv4: Using non-secure Math.random() fallback...')
  }
  // ... Math.random() implementation
}
```

**Testing:**
```typescript
describe('generateUUIDv4', () => {
  it('uses crypto.randomUUID() on Node.js 15+', () => {
    const result = generateUUIDv4()
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
  
  it('has version 4 bit set (0x40 in octet 7)', () => {
    const uuid = generateUUIDv4()
    const byte7 = parseInt(uuid.substring(14, 16), 16)
    expect((byte7 & 0x40) === 0x40).toBe(true)
  })
})
```

**Verification Commands:**
```bash
npm test -- dashboard/lib/uuid.test.ts
node -e "console.log(require('./dashboard/lib/uuid').generateUUIDv4())"
```

**Risk if Not Fixed:** Weak ID generation; potential for ID collision; reduced security of session identifiers

---

### 2. Rate Limit Bypass - Unvalidated Session Cookie

**Issue:** `dashboard/lib/rate-limit-middleware.ts` line 128 uses raw cookie value without validation

**Current Code:**
```typescript
function extractUserId(request: NextRequest): string | undefined {
  const sessionCookie = request.cookies.get('auth')
  if (sessionCookie?.value) {
    // SECURITY: Only use if it's a session cookie with server-side validation
    return sessionCookie.value  // ← NO VALIDATION!
  }
  return undefined
}
```

**Attack Scenario:**
```
1. Attacker sends: Cookie: auth=ATTACKER_PAYLOAD
2. Rate limiter uses ATTACKER_PAYLOAD as user ID
3. Attacker sends 1000 requests with different payloads
4. Each payload has independent rate limit quota
5. Result: Bypass rate limiting entirely
```

**Required Fix:**

Replace with validation:

```typescript
/**
 * Validate session cookie format
 * Accepts UUID or standard JWT format
 */
function isValidSessionCookie(value: string): boolean {
  if (!value) return false
  
  // Check format: UUID or JWT (3 parts separated by dots)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  const isJWT = /^[A-Za-z0-9_-]{20,}\./.test(value)  // Starts like JWT
  
  // Maximum reasonable length (512 chars)
  if (value.length > 512) return false
  
  return isUUID || isJWT
}

function extractUserId(request: NextRequest): string | undefined {
  const sessionCookie = request.cookies.get('auth')
  if (sessionCookie?.value) {
    // SECURITY: Validate session cookie format
    if (!isValidSessionCookie(sessionCookie.value)) {
      logger?.warn('Invalid session cookie format', {
        cookieLength: sessionCookie.value.length,
        cookiePrefix: sessionCookie.value.substring(0, 20),
      })
      return undefined  // Invalid format → fall back to IP-based limiting
    }
    return sessionCookie.value
  }
  return undefined
}
```

**Testing:**
```typescript
describe('extractUserId', () => {
  it('accepts UUID format', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const result = extractUserId(mockRequest({ auth: uuid }))
    expect(result).toBe(uuid)
  })
  
  it('accepts JWT format', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    const result = extractUserId(mockRequest({ auth: jwt }))
    expect(result).toBe(jwt)
  })
  
  it('rejects random strings', () => {
    const result = extractUserId(mockRequest({ auth: 'random-garbage-payload' }))
    expect(result).toBeUndefined()
  })
  
  it('rejects oversized payloads (>512 chars)', () => {
    const huge = 'x'.repeat(600)
    const result = extractUserId(mockRequest({ auth: huge }))
    expect(result).toBeUndefined()
  })
})
```

**Risk if Not Fixed:** Complete rate limiting bypass; attacker can exhaust API quota for legitimate users

---

### 3. Rate Limit Bypass - Unvalidated API Key

**Issue:** `dashboard/lib/rate-limit-middleware.ts` line 141 extracts API key without minimum length check

**Current Code:**
```typescript
function extractApiKey(request: NextRequest): string | undefined {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('ApiKey ')) {
    return authHeader.substring(7)  // ← Can be empty string!
  }
  return undefined
}
```

**Attack Scenario:**
```
1. Attacker sends: Authorization: ApiKey (no value)
2. Returns empty string as API key ID
3. All such requests share same rate limit bucket
4. Attacker sends 1000+ requests with empty key
5. Legitimate empty-key requests get rate-limited
```

**Required Fix:**

```typescript
/**
 * Validate API key format
 * Assumes keys are at least 12 characters (adjust based on your spec)
 */
function isValidApiKey(key: string): boolean {
  if (!key) return false
  
  // Minimum 12 characters
  if (key.length < 12) return false
  
  // Maximum 256 characters
  if (key.length > 256) return false
  
  // Should be alphanumeric (adjust if you allow symbols)
  if (!/^[a-zA-Z0-9_-]{12,256}$/.test(key)) return false
  
  return true
}

function extractApiKey(request: NextRequest): string | undefined {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('ApiKey ')) {
    const key = authHeader.substring(7)
    
    // SECURITY: Validate API key format
    if (!isValidApiKey(key)) {
      logger?.warn('Invalid API key format', {
        keyLength: key.length,
        keyPrefix: key.substring(0, 8),
      })
      return undefined
    }
    
    return key
  }
  return undefined
}
```

**Testing:**
```typescript
describe('extractApiKey', () => {
  it('accepts valid API keys (12+ chars)', () => {
    const key = 'sk_test_1234567890abcdef'
    const result = extractApiKey(mockRequest({ auth: `ApiKey ${key}` }))
    expect(result).toBe(key)
  })
  
  it('rejects empty API key', () => {
    const result = extractApiKey(mockRequest({ auth: 'ApiKey ' }))
    expect(result).toBeUndefined()
  })
  
  it('rejects short API keys (<12 chars)', () => {
    const result = extractApiKey(mockRequest({ auth: 'ApiKey short' }))
    expect(result).toBeUndefined()
  })
  
  it('rejects oversized API keys (>256 chars)', () => {
    const huge = 'ApiKey ' + 'x'.repeat(300)
    const result = extractApiKey(mockRequest({ auth: huge }))
    expect(result).toBeUndefined()
  })
})
```

**Risk if Not Fixed:** Rate limiting bypass; API abuse protection ineffective

---

## HIGH-PRIORITY ISSUES (Fix This Week)

### 4. Misleading Comments - Crypto Utils Documentation

**Issue:** Comment says code was moved to top-level import, but it wasn't

**File:** `dashboard/lib/crypto-utils.ts`, line 37

**Current Code:**
```typescript
// Line 37: "FIXED: Moved require() to top-level import for better performance and consistency"
// But line 18: require() is still inside getLogger() function ← STILL LAZY-LOADED
```

**Fix:**
```typescript
/**
 * Aliases for backwards compatibility
 * IMPLEMENTATION: Uses lazy-loaded logger to avoid circular dependencies
 * Require() is loaded on-demand inside getLogger() function
 */
export function generateSecureRandomId(): string {
  return generateUUIDv4()
}
```

**Verification:** Code review to ensure comments match implementation

---

### 5. Logger Signature Mismatch

**Issue:** Fallback logger doesn't match Logger interface

**File:** `dashboard/lib/crypto-utils.ts`, lines 21-27

**Current Code:**
```typescript
logger = {
  warn: (msg: string) => {  // ← Only accepts msg parameter
    if (typeof console !== 'undefined') {
      console.warn('[crypto-utils]', msg)
    }
  },
}
```

**Logger Interface Likely:**
```typescript
interface Logger {
  warn(message: string, context?: Record<string, unknown>): void
}
```

**Fix:**
```typescript
logger = {
  warn: (msg: string, context?: Record<string, unknown>) => {
    if (typeof console !== 'undefined') {
      console.warn('[crypto-utils]', msg, context || {})
    }
  },
}
```

---

### 6. Integrate SQL Injection Detection

**Status:** Function exists but unused

**File:** `dashboard/lib/input-validation.ts`

**Required Integration:**
```typescript
export async function validateBody<T>(
  request: NextRequest,
  schema: ZodSchema
) {
  // ... existing validation ...
  
  try {
    const validatedData = schema.parse(body)
    
    // NEW: Check for SQL injection patterns in string fields
    const stringFields = Object.entries(validatedData).filter(
      ([_, v]) => typeof v === 'string'
    )
    
    for (const [field, value] of stringFields) {
      if (detectSqlInjection(value)) {
        logger.warn('Potential SQL injection detected', {
          field,
          value: value.substring(0, 50),
        })
        return {
          success: false,
          response: NextResponse.json({
            success: false,
            error: 'Invalid input format',
            timestamp: new Date().toISOString(),
          }, { status: 400 })
        }
      }
    }
    
    return { success: true, data: validatedData }
  }
}
```

---

## MEDIUM-PRIORITY ISSUES (Fix This Sprint)

### 7. Migrate localStorage to httpOnly Cookies

**File:** `dashboard/examples/authenticated-requests.ts`

**Current (Vulnerable):**
```typescript
const token = localStorage.getItem('authToken')
```

**Better (Secure):**
```typescript
// Use httpOnly cookie instead (automatic with fetch/axios)
// Server sets: Set-Cookie: authToken=...; HttpOnly; Secure; SameSite=Strict
const response = await fetch('/api/auth/login', { credentials: 'include' })
```

---

### 8. Remove Dead Code

**File:** `dashboard/lib/uuid.ts`, lines 52-54

**Remove:**
```typescript
const fallbackLogger = getLogger()
if (fallbackLogger) {  // This check is always true
  fallbackLogger.warn(...)
}
```

**Replace with:**
```typescript
const fallbackLogger = getLogger()
fallbackLogger.warn('[SECURITY] generateUUIDv4: Using non-secure Math.random() fallback...')
```

---

## REMEDIATION CHECKLIST

```markdown
Phase 1: CRITICAL (2-3 hours)
- [ ] Restore crypto.randomUUID() check in uuid.ts
  - Estimated time: 30 min
  - Files: dashboard/lib/uuid.ts
  - Test: npm test -- uuid.test.ts
  
- [ ] Add session cookie validation in rate-limit-middleware.ts
  - Estimated time: 30 min
  - Files: dashboard/lib/rate-limit-middleware.ts
  - Test: npm test -- rate-limit-middleware.test.ts
  
- [ ] Add API key length validation in rate-limit-middleware.ts
  - Estimated time: 30 min
  - Files: dashboard/lib/rate-limit-middleware.ts
  - Test: npm test -- rate-limit-middleware.test.ts
  
- [ ] Create/update unit tests for rate limiter
  - Estimated time: 60 min
  - Files: dashboard/lib/__tests__/rate-limit-middleware.test.ts

Phase 2: HIGH-PRIORITY (4-6 hours)
- [ ] Fix misleading comments in crypto-utils.ts
  - Estimated time: 15 min
  - Review: Manual code review
  
- [ ] Update logger fallback signature
  - Estimated time: 15 min
  - Files: dashboard/lib/crypto-utils.ts, uuid.ts
  
- [ ] Integrate detectSqlInjection() into validation
  - Estimated time: 60 min
  - Files: dashboard/lib/input-validation.ts
  
- [ ] Document CSRF protection strategy
  - Estimated time: 30 min
  - Files: docs/SECURITY.md (create)

Phase 3: MEDIUM-PRIORITY (6-8 hours)
- [ ] Migrate examples to httpOnly cookies
  - Estimated time: 60 min
  - Files: dashboard/examples/authenticated-requests.ts
  
- [ ] Remove dead code
  - Estimated time: 30 min
  - Files: dashboard/lib/uuid.ts
  
- [ ] Create security testing suite
  - Estimated time: 180 min
  - Files: dashboard/__tests__/security.test.ts

Total Estimated Time: 6-9 hours
```

---

## VERIFICATION CHECKLIST

After each fix, verify:

```bash
# Run unit tests
npm test -- dashboard/lib

# Run security-focused tests
npm test -- --grep "security|inject|csrf|auth|rate|crypt"

# Type check
npm run type-check

# Lint
npm run lint

# Build
npm run build

# Integration tests
npm run test:integration
```

---

## DEPLOYMENT GATING

**Do NOT deploy to production until all CRITICAL items are fixed and tested.**

Deployment checklist:
- [ ] All CRITICAL issues resolved
- [ ] Unit tests pass (100% for affected modules)
- [ ] Integration tests pass
- [ ] Security audit re-run (verify all 12 categories green)
- [ ] Code review approval
- [ ] Staging environment verification

---

## FOLLOW-UP ACTIONS

**After Deployment:**
1. Monitor rate limiter metrics for anomalies
2. Track UUID generation performance (native vs fallback)
3. Review auth logs for failed validation attempts
4. Schedule follow-up security audit (60 days)

**Continuous Improvement:**
1. Add security scanning to CI/CD pipeline
2. Implement security headers as CSP, HSTS
3. Regular OWASP Top 10 reviews
4. Quarterly penetration testing

---

**Action Plan Version:** 1.0  
**Last Updated:** 2026-10-22  
**Owner:** Security Team  
**Next Review:** After deployment completion
