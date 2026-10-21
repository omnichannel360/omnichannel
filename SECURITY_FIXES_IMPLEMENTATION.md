# SECURITY FIXES IMPLEMENTATION PLAN
## Remediation for Audit 74/150
**Priority:** Critical + High fixes required before merge

---

## CRITICAL FIX #1: JWT Secret Undefined (rate-limit-middleware.ts)

**Current Code (Lines 19-20):**
```typescript
import jwt from 'jsonwebtoken'
const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET
```

**Problem:** If both env vars missing, JWT_SECRET = undefined, validation passes with format check only.

**Fixed Code:**
```typescript
import jwt from 'jsonwebtoken'

// Require JWT_SECRET at startup to prevent silent failures
const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET
if (!JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET or NEXTAUTH_SECRET environment variable must be set. ' +
    'Session validation will not work without it. Check .env configuration.'
  )
}
```

**Testing:**
- Verify error thrown on startup if both env vars missing
- Verify application starts with one env var set
- Verify forged JWT format-only tokens REJECTED when secret present

---

## CRITICAL FIX #2: Origin Validation (csrf-protection.ts)

**Current Code (Line 195):**
```typescript
if (allowedOrigins && !allowedOrigins.some(ao => origin.includes(ao))) {
```

**Problem:** Substring matching allows `evil.com.legitimate.com` to pass if `legitimate.com` allowed.

**Fixed Code:**
```typescript
if (allowedOrigins && !allowedOrigins.some(ao => {
  try {
    // Parse both origins as URLs for proper comparison
    const requestOrigin = new URL(origin)
    
    // Handle origins with or without protocol
    const allowedOriginUrl = ao.includes('://') 
      ? new URL(ao)
      : new URL(`https://${ao}`)
    
    // Compare full origin: protocol + hostname + port must match exactly
    return requestOrigin.origin === allowedOriginUrl.origin
  } catch (e) {
    // Invalid URL format - reject
    logger.warn('Invalid origin URL format', {
      operation: 'csrf-middleware',
      origin,
      allowedOrigin: ao,
    })
    return false
  }
})) {
```

**Testing:**
```typescript
// Valid origins
✓ new URL('https://legitimate.com').origin === new URL('legitimate.com').origin
✓ new URL('https://app.legitimate.com').origin === new URL('https://app.legitimate.com').origin

// Invalid - should REJECT
✗ new URL('https://evil.com.legitimate.com').origin === new URL('legitimate.com').origin
✗ new URL('http://legitimate.com').origin === new URL('https://legitimate.com').origin (different ports)
```

---

## CRITICAL FIX #3: Password Validation Logic (validation/schemas.ts)

**Current Code (Lines 21-30):**
```typescript
export const PasswordSchema = z
  .string()
  .min(PASSWORD_VALIDATION.minLength, ...)
  .max(PASSWORD_VALIDATION.maxLength, ...)
  .regex(/[A-Z]/, ...)
  .regex(/[a-z]/, ...)
  .regex(/[0-9]/, ...)
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, ...)
  .refine((pwd) => !/(.)\1{2,}/.test(pwd), '...')
  .refine((pwd) => PASSWORD_VALIDATION.regex.test(pwd), PASSWORD_VALIDATION.description)
```

**Problem:** Need to verify what PASSWORD_VALIDATION.regex actually does. If it matches repeated patterns, refine() logic is inverted.

**First, check the constant:**
```bash
grep -r "PASSWORD_VALIDATION" dashboard/lib/validation/ | grep -E "(regex|const|export)"
```

**Most Likely Fix (if regex matches BAD patterns):**
```typescript
// PASSWORD_VALIDATION.regex should match GOOD passwords only
// If it matches bad patterns, invert the check:

export const PasswordSchema = z
  .string()
  .min(PASSWORD_VALIDATION.minLength, `Password must be at least ${PASSWORD_VALIDATION.minLength} characters`)
  .max(PASSWORD_VALIDATION.maxLength, `Password must not exceed ${PASSWORD_VALIDATION.maxLength} characters`)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character')
  .refine((pwd) => !/(.)\1{2,}/.test(pwd), 'Password cannot contain more than 2 consecutive identical characters')
  .refine(
    (pwd) => PASSWORD_VALIDATION.regex.test(pwd),
    PASSWORD_VALIDATION.description
  )
  // Alternative if regex logic is inverted:
  // .refine((pwd) => !PASSWORD_VALIDATION.regex.test(pwd), 'Password does not meet security requirements')
```

**Testing:**
```typescript
const testPasswords = {
  '✓ Valid1!aB': true,      // Mixed case, number, special char, 8+ chars
  '✗ aaaa1!Bb': false,      // 3+ consecutive 'a's
  '✗ 12345678': false,      // No letters/special
  '✗ test123test': false,   // Repeated substring pattern (if regex checks for this)
}
```

---

## HIGH FIX #1: Session Cookie as User ID (rate-limit-middleware.ts)

**Current Code (Lines 177-184):**
```typescript
// Try to get from cookie
const sessionCookie = request.cookies.get('auth')
if (sessionCookie?.value) {
  // SECURITY: Validate session cookie format
  if (!isValidSessionCookie(sessionCookie.value)) {
    return undefined // Invalid format → fall back to IP-based limiting
  }
  return sessionCookie.value  // <-- Returns entire JWT/UUID as userId
}
```

**Problem:** Entire cookie value returned, may contain sensitive claims. Should extract userId claim only.

**Fixed Code:**
```typescript
// Try to get from cookie
const sessionCookie = request.cookies.get('auth')
if (sessionCookie?.value) {
  // SECURITY: Validate session cookie format
  if (!isValidSessionCookie(sessionCookie.value)) {
    return undefined // Invalid format → fall back to IP-based limiting
  }
  
  // SECURITY: Extract userId claim, don't use entire token as key
  // This prevents exposure of potentially sensitive JWT claims in logs/headers
  try {
    const decoded = jwt.decode(sessionCookie.value) as Record<string, unknown> | null
    if (decoded && typeof decoded === 'object') {
      // Extract userId from common claim names
      const userId = decoded.userId || decoded.sub || decoded.user_id || decoded.id
      if (typeof userId === 'string') {
        return userId
      }
    }
  } catch (error) {
    // Decode failed - fall through to IP-based limiting
  }
  
  // Fallback: If we can validate but not decode, use hashed cookie as opaque ID
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(sessionCookie.value).digest('hex').substring(0, 12)
}
```

**Testing:**
```typescript
// Test JWT with claims
const testToken = jwt.sign(
  { userId: 'user-123', email: 'user@example.com', role: 'admin' },
  'secret'
)
// Should extract: 'user-123', not the full token

// Test UUID
const uuidToken = '550e8400-e29b-41d4-a716-446655440000'
// Should extract: hash of it, not the UUID itself
```

---

## HIGH FIX #2: XSS Protection (validation/schemas.ts)

**Current Code (Lines 38-53):**
```typescript
// Safe string factory - creates string schemas with XSS protection
function createSafeString(minLength = 0, maxLength = 1000) {
  let schema = z.string()
  
  if (minLength > 0) {
    schema = schema.min(minLength, ...)
  }
  
  schema = schema.max(maxLength, ...)
  
  return schema.refine(
    (val) => !val.includes('<script') && !val.includes('javascript:'),
    'String contains forbidden patterns'
  )
}
```

**Problem:** Incomplete XSS protection (case sensitivity, event handlers, entities, etc.).

**Fixed Code - Option 1: Use DOMPurify (Recommended)**
```typescript
import DOMPurify from 'isomorphic-dompurify'

function createSafeString(minLength = 0, maxLength = 1000) {
  let schema = z.string()
  
  if (minLength > 0) {
    schema = schema.min(minLength, `String must be at least ${minLength} characters`)
  }
  
  schema = schema.max(maxLength, `String must not exceed ${maxLength} characters`)
  
  // Use DOMPurify to sanitize HTML - much more comprehensive than regex
  return schema.refine(
    (val) => {
      // Sanitize with no allowed tags (text only)
      const cleaned = DOMPurify.sanitize(val, {
        ALLOWED_TAGS: [], // No HTML tags allowed
        ALLOWED_ATTR: [], // No attributes allowed
      })
      
      // Ensure value unchanged after sanitization
      // If it changed, it contained HTML that was removed
      return cleaned === val
    },
    'String contains potentially unsafe HTML or JavaScript'
  )
}
```

**Fixed Code - Option 2: Strict Regex (If DOMPurify not available)**
```typescript
function createSafeString(minLength = 0, maxLength = 1000) {
  let schema = z.string()
  
  if (minLength > 0) {
    schema = schema.min(minLength, ...)
  }
  
  schema = schema.max(maxLength, ...)
  
  // Comprehensive XSS pattern matching (case-insensitive)
  const xssPatterns = [
    /<script[^>]*>[\s\S]*?<\/script>/gi,           // Script tags
    /javascript:/gi,                                // JavaScript protocol
    /on\w+\s*=/gi,                                  // Event handlers (onclick=, onerror=, etc)
    /<iframe[^>]*>/gi,                              // Iframes
    /<embed[^>]*>/gi,                               // Embed tags
    /<object[^>]*>/gi,                              // Object tags
    /&#\d+;/g,                                      // HTML entities (allow safe numbers)
    /&#x[0-9a-f]+;/gi,                              // Hex entities
    /vbscript:/gi,                                  // VBScript protocol
    /data:text\/html/gi,                            // Data URLs
  ]
  
  return schema.refine(
    (val) => !xssPatterns.some(pattern => pattern.test(val)),
    'String contains potentially unsafe HTML or JavaScript'
  )
}
```

**Install dependency:**
```bash
npm install isomorphic-dompurify
npm install --save-dev @types/isomorphic-dompurify
```

**Testing:**
```typescript
const SafeSchema = createSafeString()

// Should PASS
✓ SafeSchema.parse('Hello world')
✓ SafeSchema.parse('Normal text with spaces')

// Should FAIL - all variations
✗ SafeSchema.parse('<script>alert(1)</script>')
✗ SafeSchema.parse('<SCRIPT>alert(1)</SCRIPT>')
✗ SafeSchema.parse('<img src=x onerror=alert(1)>')
✗ SafeSchema.parse('<img src=x ONERROR=alert(1)>')
✗ SafeSchema.parse('javascript:alert(1)')
✗ SafeSchema.parse('&#60;script&#62;')
✗ SafeSchema.parse('<svg onload=alert(1)>')
✗ SafeSchema.parse('data:text/html,<script>alert(1)</script>')
```

---

## HIGH FIX #3: CSRF Token Store Scalability (csrf-protection.ts)

**Current Code (Lines 21, 26-42, 73):**
```typescript
// In-memory store (bad for production)
const csrfTokenStore = new Map<string, { timestamp: number; origin: string }>()

function cleanupExpiredTokens(): void {
  // Only called every 100 registrations
  if (csrfTokenStore.size % 100 === 0) {
    cleanupExpiredTokens()
  }
}
```

**Problem:** Memory leak, no horizontal scaling, cleanup only reactive.

**Fixed Code - Using Redis (Production):**
```typescript
import Redis from 'redis'

// Use Redis for distributed, persistent token storage
const redis = Redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB) : 0,
})

const CSRF_TOKEN_PREFIX = 'csrf:token:'
const CSRF_TOKEN_TTL = 60 * 60 // 1 hour in seconds

export async function registerCSRFToken(token: string, origin: string): Promise<void> {
  // Validate token format
  if (!CSRF_TOKEN_PATTERN.test(token)) {
    logger.warn('Invalid CSRF token format attempted', {
      operation: 'csrf-register',
      tokenLength: token.length,
    })
    return
  }

  // Store in Redis with automatic expiration
  const key = CSRF_TOKEN_PREFIX + token
  await redis.setEx(
    key,
    CSRF_TOKEN_TTL,
    JSON.stringify({ timestamp: Date.now(), origin })
  )

  logger.debug('CSRF token registered', {
    operation: 'csrf-register',
    tokenId: token.substring(0, 8),
    origin,
  })
}

export async function validateCSRFToken(token: string, origin: string): Promise<boolean> {
  // Validate token format
  if (!CSRF_TOKEN_PATTERN.test(token)) {
    logger.warn('CSRF token validation failed: invalid format', {
      operation: 'csrf-validate',
      tokenLength: token.length,
    })
    return false
  }

  const key = CSRF_TOKEN_PREFIX + token
  
  try {
    // Get token from Redis
    const storedData = await redis.get(key)
    
    if (!storedData) {
      logger.warn('CSRF token validation failed: token not found', {
        operation: 'csrf-validate',
        tokenId: token.substring(0, 8),
      })
      return false
    }

    const storedToken = JSON.parse(storedData)

    // Verify origin match
    if (storedToken.origin !== origin) {
      logger.warn('CSRF token validation failed: origin mismatch', {
        operation: 'csrf-validate',
        expectedOrigin: storedToken.origin,
        providedOrigin: origin,
      })
      return false
    }

    // Delete token (one-time use)
    await redis.del(key)

    logger.debug('CSRF token validated successfully', {
      operation: 'csrf-validate',
      tokenId: token.substring(0, 8),
      origin,
    })

    return true
  } catch (error) {
    logger.error('CSRF validation error', error, {
      operation: 'csrf-validate',
      tokenId: token.substring(0, 8),
    })
    return false
  }
}
```

**Fixed Code - Fallback In-Memory (Development Only):**
```typescript
const csrfTokenStore = new Map<string, { timestamp: number; origin: string }>()
const MAX_TOKEN_STORE_SIZE = 10000

function cleanupExpiredTokens(): void {
  const now = Date.now()
  const toDelete: string[] = []

  for (const [token, data] of csrfTokenStore.entries()) {
    if (now - data.timestamp > MAX_TOKEN_AGE_MS) {
      toDelete.push(token)
    }
  }

  toDelete.forEach(token => csrfTokenStore.delete(token))

  if (toDelete.length > 0) {
    logger.debug(`Cleaned up ${toDelete.length} expired CSRF tokens`, {
      operation: 'csrf-cleanup',
    })
  }
}

// Proactive cleanup: Every 5 minutes or when size exceeds limit
setInterval(() => {
  if (csrfTokenStore.size > MAX_TOKEN_STORE_SIZE * 0.8) {
    cleanupExpiredTokens()
  }
}, 5 * 60 * 1000)

export function registerCSRFToken(token: string, origin: string): void {
  if (!CSRF_TOKEN_PATTERN.test(token)) {
    logger.warn('Invalid CSRF token format attempted', {
      operation: 'csrf-register',
      tokenLength: token.length,
    })
    return
  }

  // Reject if store too large (DoS prevention)
  if (csrfTokenStore.size >= MAX_TOKEN_STORE_SIZE) {
    logger.warn('CSRF token store full, rejecting new tokens', {
      operation: 'csrf-register',
      storeSize: csrfTokenStore.size,
    })
    return
  }

  csrfTokenStore.set(token, {
    timestamp: Date.now(),
    origin,
  })

  logger.debug('CSRF token registered', {
    operation: 'csrf-register',
    tokenId: token.substring(0, 8),
    origin,
  })
}
```

---

## MEDIUM PRIORITY FIXES

### MEDIUM FIX #1: Information Disclosure (validation/middleware.ts)

**Lines to change:**
- Line 61: Make error message generic
- Line 79: Don't reveal exact byte counts
- Line 112-114: Sanitize logged paths
- Line 174: Generic error message

**Pattern:**
```typescript
// BEFORE
error: `Invalid Content-Type: ${contentType}. Expected application/json`,
logger.warn('Request header validation failed', {
  path: request.nextUrl.pathname,

// AFTER
error: 'Invalid request headers',
logger.warn('Request header validation failed', {
  path: request.nextUrl.pathname.split('/').slice(0, 2).join('/'), // Sanitize
```

---

### MEDIUM FIX #2: IP Spoofing (rate-limit-middleware.ts:67)

**Check getClientIp() implementation and verify it:**
1. Only trusts X-Forwarded-For from known proxies
2. Falls back to connection IP if header absent
3. Validates IP format

---

## TESTING CHECKLIST

After all fixes applied:

- [ ] Unit tests for JWT secret validation
- [ ] Unit tests for origin validation (origin.includes() vs URL parsing)
- [ ] Unit tests for password validation (no inverted logic)
- [ ] Unit tests for XSS patterns (case insensitive, event handlers)
- [ ] Unit tests for CSRF token store (Redis or in-memory with size limit)
- [ ] Integration tests for rate limiting with spoofed IPs
- [ ] Security scan with npm audit
- [ ] Run /code-review again on all modified files
- [ ] Verify 5.0σ or higher (DMAIC passing grade)

---

## DEPLOYMENT CHECKLIST

- [ ] All CRITICAL fixes applied and tested
- [ ] All HIGH fixes applied and tested
- [ ] Security code review completed
- [ ] Penetration test scheduled
- [ ] Environment variables documented (.env.example)
- [ ] Redis configuration documented (if using Redis)
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured for CSRF failures
- [ ] Rate limit headers validated in production traffic
