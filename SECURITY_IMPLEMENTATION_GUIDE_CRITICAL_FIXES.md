# Security Implementation Guide - Critical Fixes
**Date:** 2026-10-22 | **Target Completion:** 2-3 days | **Priority:** BLOCKING

---

## FIX #1: AUTH-4.1 Password-Based Authentication Implementation

### File: `dashboard/auth.config.ts` (Lines 297-317)

#### Before (Broken)
```typescript
async function validateUserCredentials(
  email: string,
  password: string
): Promise<{ id: string; email: string; role: 'admin' | 'user' | 'viewer' } | null> {
  // CRITICAL: This function is INTENTIONALLY unimplemented to prevent bypassing auth.
  logger.error('CRITICAL: Password authentication unavailable...')
  return null // Always returns null
}
```

#### After (Fixed)
```typescript
/**
 * User credential validation using bcrypt
 * Validates email and password against database
 */
async function validateUserCredentials(
  email: string,
  password: string
): Promise<{ id: string; email: string; role: 'admin' | 'user' | 'viewer' } | null> {
  try {
    // Validate input format
    if (!email || !password) {
      return null
    }
    
    if (!email.includes('@') || email.length > 255) {
      return null
    }
    
    if (password.length < 8 || password.length > 1024) {
      return null
    }
    
    // Query database for user
    const user = await prisma.users.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        password_hash: true,
        role: true,
        status: true,
      },
    })
    
    // User not found
    if (!user) {
      logger.warn('Authentication failed - user not found', {
        component: 'auth.config',
        operation: 'validateUserCredentials',
        email: email,
      })
      return null
    }
    
    // Check if account is active
    if (user.status !== 'active') {
      logger.warn('Authentication failed - account inactive', {
        component: 'auth.config',
        operation: 'validateUserCredentials',
        email: email,
        status: user.status,
      })
      return null
    }
    
    // Verify password hash using bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash)
    
    if (!isPasswordValid) {
      logger.warn('Authentication failed - invalid password', {
        component: 'auth.config',
        operation: 'validateUserCredentials',
        email: email,
      })
      return null
    }
    
    // Successfully authenticated
    logger.info('User password authenticated successfully', {
      component: 'auth.config',
      operation: 'validateUserCredentials',
      userId: user.id,
      email: user.email,
    })
    
    return {
      id: user.id,
      email: user.email,
      role: (user.role as 'admin' | 'user' | 'viewer') || 'user',
    }
  } catch (error) {
    logger.error('validateUserCredentials error', error, {
      component: 'auth.config',
      operation: 'validateUserCredentials',
      email: email,
    })
    return null
  }
}
```

#### Dependencies Required
```bash
npm install bcrypt
npm install --save-dev @types/bcrypt
# Assume Prisma is already installed for DB operations
```

#### Tests Required
```typescript
// In dashboard/__tests__/auth.config.test.ts

describe('validateUserCredentials', () => {
  it('returns user on valid credentials', async () => {
    const user = await validateUserCredentials('user@example.com', 'validPassword123')
    expect(user).toBeDefined()
    expect(user?.email).toBe('user@example.com')
  })

  it('returns null on invalid password', async () => {
    const user = await validateUserCredentials('user@example.com', 'wrongPassword')
    expect(user).toBeNull()
  })

  it('returns null on non-existent user', async () => {
    const user = await validateUserCredentials('nonexistent@example.com', 'password123')
    expect(user).toBeNull()
  })

  it('rejects inactive accounts', async () => {
    const user = await validateUserCredentials('inactive@example.com', 'correctPassword')
    expect(user).toBeNull()
  })

  it('validates email format', async () => {
    const user1 = await validateUserCredentials('invalid-email', 'password123')
    const user2 = await validateUserCredentials('', 'password123')
    expect(user1).toBeNull()
    expect(user2).toBeNull()
  })

  it('validates password length', async () => {
    const user1 = await validateUserCredentials('user@example.com', 'short')
    const user2 = await validateUserCredentials('user@example.com', 'a'.repeat(1025))
    expect(user1).toBeNull()
    expect(user2).toBeNull()
  })
})
```

---

## FIX #2: XSS-2.1 Query Parameter Sanitization

### File: `dashboard/lib/validation/middleware.ts` (Line 296)

#### Create Sanitization Utility
**New File:** `dashboard/lib/sanitize.ts`
```typescript
/**
 * XSS Sanitization Utilities
 * Sanitizes user input to prevent cross-site scripting attacks
 */

import { sanitize } from 'isomorphic-dompurify'

/**
 * Sanitize string input to prevent XSS
 * Removes dangerous HTML/JavaScript
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return ''
  }

  // First: remove null bytes
  let sanitized = input.replace(/\0/g, '')

  // Second: use DOMPurify to remove dangerous HTML
  sanitized = sanitize(sanitized, {
    ALLOWED_TAGS: [], // No tags allowed in user input
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true, // Keep text content
  })

  // Third: trim and limit length
  sanitized = sanitized.trim().substring(0, 1000)

  return sanitized
}

/**
 * Sanitize all query parameters recursively
 */
export function sanitizeQuery(
  query: Record<string, any>
): Record<string, any> {
  const sanitized: Record<string, any> = {}

  for (const [key, value] of Object.entries(query)) {
    // Skip numeric indices
    if (/^\d+$/.test(key)) {
      continue
    }

    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value)
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((v) =>
        typeof v === 'string' ? sanitizeString(v) : v
      )
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeQuery(value)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

/**
 * Escape HTML entities for safe rendering
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (char) => map[char])
}
```

#### Update Middleware
**File:** `dashboard/lib/validation/middleware.ts`

```typescript
// Add imports
import { sanitizeQuery } from './sanitize'

// Line 296 - BEFORE
// const queryObject = { ...query }

// Line 296 - AFTER
const queryObject = sanitizeQuery(query)
```

#### Add CSP Headers Globally
**File:** `dashboard/app/layout.tsx` (or `next.config.js`)

```typescript
// In next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'",
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
]

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}
```

#### Dependencies Required
```bash
npm install isomorphic-dompurify
npm install --save-dev @types/isomorphic-dompurify
```

#### Tests Required
```typescript
// dashboard/__tests__/sanitize.test.ts

describe('sanitizeString', () => {
  it('removes script tags', () => {
    const input = '<script>alert("XSS")</script>hello'
    const result = sanitizeString(input)
    expect(result).toBe('hello')
    expect(result).not.toContain('script')
  })

  it('removes event handlers', () => {
    const input = '<img src=x onerror="alert(1)">test'
    const result = sanitizeString(input)
    expect(result).not.toContain('onerror')
    expect(result).toBe('test')
  })

  it('removes null bytes', () => {
    const input = 'hello\0world'
    const result = sanitizeString(input)
    expect(result).toBe('helloworld')
  })

  it('limits length to 1000 chars', () => {
    const input = 'a'.repeat(2000)
    const result = sanitizeString(input)
    expect(result.length).toBeLessThanOrEqual(1000)
  })

  it('preserves safe text', () => {
    const input = 'Hello World 123'
    const result = sanitizeString(input)
    expect(result).toBe('Hello World 123')
  })
})

describe('sanitizeQuery', () => {
  it('sanitizes all query parameters', () => {
    const query = {
      search: '<script>alert(1)</script>test',
      category: 'safe',
      filters: ['<img src=x onerror=1>', 'safe'],
    }
    const result = sanitizeQuery(query)
    expect(result.search).not.toContain('script')
    expect(result.filters[0]).not.toContain('onerror')
  })
})
```

---

## FIX #3: INJ-1.1 SQL Injection Enforcement

### File: `dashboard/lib/input-validation.ts` (Lines 252-266)

#### Step 1: Create Validation Middleware
**File:** `dashboard/lib/validate-sql-input.ts`

```typescript
/**
 * SQL Injection Prevention
 * Enforces detectSqlInjection on all user inputs
 */

import { detectSqlInjection } from './input-validation'
import { logger } from './logger'

/**
 * Validate input is safe from SQL injection
 * Throws error if injection detected
 */
export function validateSqlSafety(input: string, fieldName: string): void {
  if (detectSqlInjection(input)) {
    logger.warn('SQL injection attempt detected', {
      component: 'validate-sql-input',
      field: fieldName,
      input: input.substring(0, 100), // Log first 100 chars only
      severity: 'CRITICAL',
    })
    throw new Error(`Invalid characters detected in ${fieldName}`)
  }
}

/**
 * Validate multiple inputs
 */
export function validateSqlSafetyBatch(
  inputs: Record<string, string>,
  fieldsToValidate?: string[]
): void {
  const fields = fieldsToValidate || Object.keys(inputs)

  for (const field of fields) {
    const value = inputs[field]
    if (typeof value === 'string') {
      validateSqlSafety(value, field)
    }
  }
}

/**
 * Decorator for API route handlers
 * Automatically validates query and body parameters
 */
export function withSqlInjectionValidation(
  handler: (req: Request) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    try {
      const url = new URL(req.url)
      const query = Object.fromEntries(url.searchParams)

      // Validate query parameters
      for (const [key, value] of Object.entries(query)) {
        validateSqlSafety(value, `query.${key}`)
      }

      // Validate body if POST
      if (req.method === 'POST' || req.method === 'PUT') {
        const body = await req.json()
        validateSqlSafetyBatch(body)
      }

      return handler(req)
    } catch (error) {
      logger.error('SQL injection validation failed', error)
      return new Response(
        JSON.stringify({ error: 'Invalid input' }),
        { status: 400 }
      )
    }
  }
}
```

#### Step 2: Apply to All Database Endpoints
Example API route:

```typescript
// dashboard/app/api/search/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { validateSqlSafety } from '@/lib/validate-sql-input'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter required' },
        { status: 400 }
      )
    }

    // CRITICAL: Validate input before database use
    validateSqlSafety(query, 'search_query')

    // Safe: Prisma uses parameterized queries
    const results = await prisma.items.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 50,
    })

    return NextResponse.json(results)
  } catch (error) {
    logger.error('Search failed', error)
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    )
  }
}
```

#### Step 3: Pre-Commit Hook
**File:** `.git/hooks/pre-commit`

```bash
#!/bin/bash

# Prevent SQL injection vulnerabilities:
# 1. Check for string concatenation in SQL queries
# 2. Flag any queries not using parameterized statements

echo "Checking for SQL injection vulnerabilities..."

# Check for common SQL concatenation patterns
if git diff --cached | grep -E "\+" | grep -E "(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE).*\+" | grep -v "parameterized\|prisma\|prepared"; then
  echo "❌ ERROR: Detected potential SQL concatenation"
  echo "Use parameterized queries with Prisma or prepared statements"
  exit 1
fi

echo "✓ SQL injection check passed"
```

#### Tests Required
```typescript
// dashboard/__tests__/validate-sql-input.test.ts

describe('validateSqlSafety', () => {
  it('allows safe input', () => {
    expect(() => {
      validateSqlSafety('normal text', 'field')
    }).not.toThrow()
  })

  it('rejects SQL injection patterns', () => {
    expect(() => {
      validateSqlSafety("'; DROP TABLE users; --", 'field')
    }).toThrow()
  })

  it('rejects UNION attacks', () => {
    expect(() => {
      validateSqlSafety("' UNION SELECT * FROM admin --", 'field')
    }).toThrow()
  })

  it('logs injection attempts', () => {
    const spy = jest.spyOn(logger, 'warn')
    try {
      validateSqlSafety("1' OR '1'='1", 'field')
    } catch {}
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('SQL injection attempt')
    )
  })
})
```

---

## FIX #4: RATE-7.1 Rate Limiter IP Fallback

### File: `dashboard/lib/rate-limiter.ts` (Line 186)

#### Before (Vulnerable)
```typescript
private buildKey(ip: string, userId?: string, apiKey?: string): string {
  const components: string[] = [this.config.keyPrefix]

  if (userId) {
    components.push('user', userId)
  } else if (apiKey) {
    components.push('key', apiKey)
  } else {
    // VULNERABLE: Falls back to shared 'anonymous' bucket
    const safeIp = ip && ip.trim() ? ip : 'anonymous'
    components.push('ip', safeIp)
  }

  return components.join(':')
}
```

#### After (Fixed - Fail Explicitly)
```typescript
private buildKey(ip: string, userId?: string, apiKey?: string): string {
  const components: string[] = [this.config.keyPrefix]

  if (userId) {
    components.push('user', userId)
  } else if (apiKey) {
    components.push('key', apiKey)
  } else if (ip && ip.trim()) {
    components.push('ip', ip)
  } else {
    // FIXED: Throw error instead of using 'anonymous'
    throw new Error(
      'Rate limit key derivation failed: no userId, apiKey, or valid IP provided'
    )
  }

  return components.join(':')
}
```

#### Update Middleware Handler
**File:** `dashboard/lib/rate-limit-middleware.ts`

```typescript
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: RateLimitMiddlewareOptions
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Skip rate limiting if condition is met
    if (options.skip?.(request)) {
      return handler(request)
    }

    const limiter = getLimiter(options.config)

    // Extract client info
    const ip = getClientIp(request.headers as Record<string, string | string[] | undefined>)
    const userId = extractUserId(request)
    const apiKey = extractApiKey(request)

    // FIXED: Validate IP exists before checking rate limit
    if (!ip) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          message: 'Cannot determine client IP. Direct IP connection required.',
        },
        { status: 400 }
      )
    }

    try {
      // Check rate limit
      const result = await limiter.check(ip, userId, apiKey)

      // ... rest of handler
    } catch (error) {
      logger.error('Rate limit check failed', error)
      return NextResponse.json(
        { error: 'rate_limit_error' },
        { status: 503 }
      )
    }
  }
}
```

#### Improve getClientIp Function
**File:** `dashboard/lib/rate-limiter.ts`

```typescript
/**
 * Extract client IP from request headers
 * Validates header values and handles proxies safely
 */
export function getClientIp(headers: Record<string, string | string[] | undefined>): string | null {
  // Order matters: check trusted proxies in reverse
  const ipSources = [
    'cf-connecting-ip', // Cloudflare
    'x-forwarded-for', // Standard proxy header
    'x-real-ip', // Nginx
    'x-client-ip',
  ]

  for (const source of ipSources) {
    const value = headers[source]
    if (value) {
      // Handle both string and array formats
      const ipString = Array.isArray(value) ? value[0] : value
      const ip = ipString?.trim()

      // Validate IP format (basic check)
      if (ip && /^[\d.]+$/.test(ip) && ip.split('.').length === 4) {
        return ip
      }
    }
  }

  // Fallback: use socket IP if available
  // Note: In Next.js, socket IP may not be directly available
  // This should be handled by your deployment infrastructure

  return null // Return null instead of 'unknown'
}
```

#### Tests Required
```typescript
// dashboard/__tests__/rate-limiter.test.ts

describe('RateLimiter.buildKey', () => {
  it('uses userId when available', () => {
    const limiter = new RateLimiter(testConfig)
    const key = limiter['buildKey']('192.168.1.1', 'user123')
    expect(key).toContain('user:user123')
  })

  it('uses apiKey when no userId', () => {
    const limiter = new RateLimiter(testConfig)
    const key = limiter['buildKey']('192.168.1.1', undefined, 'apikey123')
    expect(key).toContain('key:apikey123')
  })

  it('uses IP when no userId or apiKey', () => {
    const limiter = new RateLimiter(testConfig)
    const key = limiter['buildKey']('192.168.1.1')
    expect(key).toContain('ip:192.168.1.1')
  })

  it('throws error when IP is missing', () => {
    const limiter = new RateLimiter(testConfig)
    expect(() => {
      limiter['buildKey']('', undefined, undefined)
    }).toThrow('Rate limit key derivation failed')
  })

  it('rejects "anonymous" as valid IP', () => {
    const limiter = new RateLimiter(testConfig)
    expect(() => {
      limiter['buildKey']('anonymous', undefined, undefined)
    }).toThrow()
  })
})

describe('withRateLimit middleware', () => {
  it('rejects requests without valid IP', async () => {
    const handler = withRateLimit(simpleHandler, { config: testConfig })
    const mockHeaders = new Headers()
    // No IP headers set

    const response = await handler(mockRequest)
    expect(response.status).toBe(400)
    expect(response.body).toContain('Cannot determine client IP')
  })

  it('accepts requests with valid IP', async () => {
    const handler = withRateLimit(simpleHandler, { config: testConfig })
    const mockHeaders = new Headers()
    mockHeaders.set('x-forwarded-for', '192.168.1.1')

    const response = await handler(mockRequest)
    expect(response.status).not.toBe(400)
  })
})
```

---

## FIX #5: DATA-5.1 Error Message Redaction

### File: `dashboard/lib/error-handling.ts` (Lines 150-164)

#### Before (Unsafe - Whitelist)
```typescript
// UNSAFE: Whitelist approach
const SAFE_ERROR_MESSAGES = [
  'validation error',
  'not found',
  // Limited list - missing messages leak to client
]

function formatError(error: unknown): string {
  const message = (error as Error).message
  if (SAFE_ERROR_MESSAGES.includes(message)) {
    return message
  }
  return message // ❌ LEAKS sensitive info
}
```

#### After (Safe - Blacklist with Redaction)
**File:** `dashboard/lib/error-handling.ts`

```typescript
/**
 * Error message sanitization
 * Converts internal errors to safe user-facing messages
 * Logs full details server-side for debugging
 */

import { logger } from './logger'

// Pattern list for sensitive field names
const SENSITIVE_FIELD_PATTERNS = [
  /^authorization$/i,
  /^x-token$/i,
  /^api[_-]?key$/i,
  /^access[_-]?token$/i,
  /^refresh[_-]?token$/i,
  /^x-api-key$/i,
  /^password$/i,
  /^secret$/i,
  /^credential/i,
  /^token$/i,
  /^bearer/i,
  /^session/i,
  /^cookie/i,
]

/**
 * Redact sensitive fields from object
 */
export function redactSensitiveFields(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveFields(item))
  }

  const redacted: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = SENSITIVE_FIELD_PATTERNS.some((pattern) =>
      pattern.test(key)
    )

    if (isSensitive) {
      redacted[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveFields(value)
    } else {
      redacted[key] = value
    }
  }

  return redacted
}

/**
 * Redact sensitive values from header object
 */
export function redactSensitiveHeaders(
  headers: Record<string, string | string[]>
): Record<string, string> {
  const redacted: Record<string, string> = {}

  for (const [key, value] of Object.entries(headers)) {
    const isSensitive = SENSITIVE_FIELD_PATTERNS.some((pattern) =>
      pattern.test(key)
    )

    if (isSensitive) {
      redacted[key] = '[REDACTED]'
    } else {
      redacted[key] = Array.isArray(value) ? value[0] : value
    }
  }

  return redacted
}

/**
 * Safe error message for client
 * Maps internal errors to generic messages
 */
export function formatErrorForClient(error: unknown): {
  statusCode: number
  message: string
  details?: string
} {
  // Validation errors
  if (error instanceof SyntaxError) {
    return {
      statusCode: 400,
      message: 'Invalid request format. Please check your input.',
    }
  }

  // Database errors
  if ((error as any)?.code === 'P2025') {
    return {
      statusCode: 404,
      message: 'Resource not found.',
    }
  }

  // Authentication errors
  if ((error as any)?.name === 'UnauthorizedError') {
    return {
      statusCode: 401,
      message: 'Authentication failed. Please log in again.',
    }
  }

  // Permission errors
  if ((error as any)?.name === 'ForbiddenError') {
    return {
      statusCode: 403,
      message: 'You do not have permission to access this resource.',
    }
  }

  // Rate limit errors
  if ((error as any)?.code === 'RATE_LIMIT_EXCEEDED') {
    return {
      statusCode: 429,
      message: 'Too many requests. Please try again later.',
    }
  }

  // Default: generic error
  logger.error('Unhandled application error', error, {
    errorType: (error as Error)?.name,
    errorMessage: (error as Error)?.message,
    stack: (error as Error)?.stack,
  })

  return {
    statusCode: 500,
    message: 'An error occurred. Our team has been notified.',
  }
}

/**
 * API response error wrapper
 * Ensures all API errors are properly sanitized
 */
export function createErrorResponse(error: unknown) {
  const { statusCode, message, details } = formatErrorForClient(error)

  // Log full details server-side
  const logEntry = {
    message,
    details,
    fullError: error,
    redactedError: redactSensitiveFields(error),
    timestamp: new Date().toISOString(),
  }

  if (statusCode >= 500) {
    logger.error('Server error response', logEntry)
  } else if (statusCode >= 400) {
    logger.warn('Client error response', logEntry)
  }

  return {
    statusCode,
    body: {
      error: 'error',
      message,
      ...(details && { details }),
    },
  }
}
```

#### Update All API Endpoints
Example usage:

```typescript
// dashboard/app/api/users/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/error-handling'

export async function GET(request: NextRequest) {
  try {
    // ... handler logic
    return NextResponse.json(data)
  } catch (error) {
    const { statusCode, body } = createErrorResponse(error)
    return NextResponse.json(body, { status: statusCode })
  }
}
```

#### Tests Required
```typescript
// dashboard/__tests__/error-handling.test.ts

describe('redactSensitiveFields', () => {
  it('redacts password field', () => {
    const obj = { username: 'admin', password: 'secret123' }
    const redacted = redactSensitiveFields(obj)
    expect(redacted.password).toBe('[REDACTED]')
    expect(redacted.username).toBe('admin')
  })

  it('redacts API key field', () => {
    const obj = { api_key: 'sk-prod-123', service: 'openai' }
    const redacted = redactSensitiveFields(obj)
    expect(redacted.api_key).toBe('[REDACTED]')
  })

  it('handles nested objects', () => {
    const obj = { user: { token: 'abc123', name: 'John' } }
    const redacted = redactSensitiveFields(obj)
    expect(redacted.user.token).toBe('[REDACTED]')
    expect(redacted.user.name).toBe('John')
  })
})

describe('formatErrorForClient', () => {
  it('returns generic message for unknown errors', () => {
    const error = new Error('Internal database connection failed')
    const result = formatErrorForClient(error)
    expect(result.message).not.toContain('database')
    expect(result.message).toContain('error occurred')
  })

  it('returns 401 for authentication errors', () => {
    const error = new Error('Invalid token')
    ;(error as any).name = 'UnauthorizedError'
    const result = formatErrorForClient(error)
    expect(result.statusCode).toBe(401)
  })

  it('returns 404 for not found errors', () => {
    const error = new Error('User not found')
    ;(error as any).code = 'P2025'
    const result = formatErrorForClient(error)
    expect(result.statusCode).toBe(404)
  })
})
```

---

## TESTING CHECKLIST

### Unit Tests (20+ tests)
- [ ] Password validation with bcrypt
- [ ] XSS sanitization on all input types
- [ ] SQL injection detection enforcement
- [ ] Error message redaction for sensitive fields
- [ ] Rate limiter IP validation
- [ ] Token expiration handling
- [ ] Header validation
- [ ] Input validation patterns

### Integration Tests (15+ tests)
- [ ] Complete password login flow (new)
- [ ] Token-based login and refresh
- [ ] Error response sanitization
- [ ] Rate limiting with valid IP
- [ ] Rate limiting with invalid IP
- [ ] XSS payload blocking
- [ ] SQL injection blocking
- [ ] CSRF protection

### Security Tests (10+ tests)
- [ ] XSS payload injection via query
- [ ] SQL injection attempt blocking
- [ ] Rate limit bypass attempts
- [ ] Token oracle attack prevention
- [ ] Privilege escalation attempts

---

## DEPLOYMENT VERIFICATION

Run before deploying to production:

```bash
# 1. Run all tests
npm test -- --coverage

# 2. Check coverage >= 80%
npm test -- --coverage --collectCoverageFrom="dashboard/lib/**/*.ts"

# 3. Type check
npx tsc --noEmit

# 4. Lint
npm run lint

# 5. Security audit
npm audit

# 6. Build
npm run build

# 7. Start server
npm start
```

---

**Timeline:** 2-3 days | **Owner:** Security Team | **Status:** READY FOR IMPLEMENTATION
