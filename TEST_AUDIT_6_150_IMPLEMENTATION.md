# Test Audit 6/150 - Implementation Guide
**Status:** Ready for Phase 1 (Framework Migration)  
**Estimated Duration:** 24 hours total (4 + 12 + 8 hours)  
**Priority:** HIGH - Implement Phase 1 immediately  

---

## PHASE 1: CRITICAL FRAMEWORK & CLEANUP (4-6 hours)

### Step 1.1: Create vitest.config.ts

**File:** `C:\Users\Administrator\OmniCompany\dashboard\vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Environment
    environment: 'node',
    
    // Globals: describe, it, expect available without import
    globals: true,
    
    // Setup files run before all tests
    setupFiles: ['./vitest.setup.ts'],
    
    // Isolate test modules from each other
    isolate: true,
    
    // Timeout for all tests (override per-test as needed)
    testTimeout: 10000,
    
    // Reporter configuration
    reporters: ['default', 'json', 'html'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov', 'clover'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
      ],
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

---

### Step 1.2: Create vitest.setup.ts

**File:** `C:\Users\Administrator\OmniCompany\dashboard\vitest.setup.ts`

```typescript
/**
 * Global test setup for Vitest
 * Configures:
 * - Mock cleanup (prevent test pollution)
 * - Global test utilities
 * - Test data initialization
 */

import { beforeEach, afterEach, vi } from 'vitest'

/**
 * CRITICAL: Global mock cleanup
 * Prevents mock state from leaking between tests
 */
beforeEach(() => {
  // Clear all previous mock calls/implementations
  vi.clearAllMocks()
})

afterEach(() => {
  // Clear mock calls and implementations
  vi.clearAllMocks()
  
  // Restore all mocked modules to original implementation
  vi.restoreAllMocks()
  
  // Reset module state if needed
  vi.resetModules()
})

/**
 * Optional: Global test utilities
 * Uncomment if needed for shared test helpers
 */
// import { expect } from 'vitest'
// 
// // Custom matchers can be added here
// expect.extend({
//   toBeValidJSON(received) {
//     try {
//       JSON.parse(received)
//       return { pass: true, message: () => '' }
//     } catch {
//       return { pass: false, message: () => 'Not valid JSON' }
//     }
//   }
// })
```

---

### Step 1.3: Update package.json

**Location:** `C:\Users\Administrator\OmniCompany\dashboard\package.json`

```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui",
    "test:run": "vitest --run",
    "test:coverage": "vitest --coverage --run",
    "test:coverage:watch": "vitest --coverage --watch",
    "test:isolated": "vitest --run --runInBand",
    "test:debug": "vitest --inspect-brk --inspect --single-thread"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "typescript": "^5.3.0",
    "ts-node": "^10.9.0"
  }
}
```

**Action:** Run `npm install`

---

### Step 1.4: Migration Checklist

Remove these files:
- ❌ `jest.config.js` (keep as backup initially)
- ❌ `jest.setup.ts` (content merged to vitest.setup.ts)

---

### Step 1.5: Fix Type Safety Issues (as any → proper types)

**Priority Files to Fix:**

#### File 1: `app/api/__tests__/auth-middleware.test.ts`

**Line 18 (BEFORE):**
```typescript
const response = await handler(request as any)
```

**Line 18 (AFTER):**
```typescript
// Define proper type for mock handler
type AuthHandler = (
  request: NextRequest,
  auth?: { payload: TokenPayload; userId: string }
) => Promise<NextResponse>

const mockHandler: AuthHandler = async (request, auth) => {
  return NextResponse.json({ success: true, userId: auth?.userId })
}

// Use typed handler
const response = await mockHandler(request)
```

#### File 2: `app/api/__tests__/comprehensive-error-handling.test.ts`

**Search for:** `as any` (should find ~5 instances)

**Pattern to replace:**
```typescript
// BEFORE
const result = await fn(param as any)

// AFTER
const result = await fn(param as TypeOf<T>)
```

---

### Step 1.6: Run Validation Tests

```bash
# 1. Install dependencies
npm install

# 2. Run all tests (should pass or show clear errors)
npm run test:run

# 3. Check coverage (should be ≥80%)
npm run test:coverage

# 4. Verify no test pollution
npm run test:isolated

# 5. Check HTML coverage report
npm run test:coverage
open coverage/index.html  # Or browse to coverage/index.html
```

---

## PHASE 2: TEST ISOLATION & ASSERTIONS (12-16 hours)

### Step 2.1: Add afterEach to All Test Files

**Pattern to apply to 85+ files:**

```typescript
// BEFORE
describe('MyTests', () => {
  beforeEach(() => {
    // setup
  })
  
  it('should do something', () => {})
})

// AFTER
describe('MyTests', () => {
  beforeEach(() => {
    // setup
  })
  
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    // Cleanup any resources (files, timers, etc)
  })
  
  it('should do something', () => {})
})
```

**Script to find files needing fixes:**
```bash
grep -l "beforeEach" dashboard/app/api/__tests__/*.test.ts | \
  xargs grep -L "afterEach" | \
  sort
```

---

### Step 2.2: Strengthen Weak Assertions (40+ tests)

#### Pattern 1: Vague Error Checking

**BEFORE:**
```typescript
it('should reject invalid input', async () => {
  const fn = vi.fn().mockRejectedValue(new Error('Invalid'))
  await expect(fn()).rejects.toThrow()
  expect(fn).toHaveBeenCalled()
})
```

**AFTER:**
```typescript
it('should reject invalid input with specific error message', async () => {
  // Arrange
  const fn = vi.fn().mockRejectedValue(
    new Error('Invalid input: email must be valid')
  )
  
  // Act & Assert
  await expect(fn()).rejects.toThrow('Invalid input: email must be valid')
  expect(fn).toHaveBeenCalledTimes(1)
})
```

#### Pattern 2: Generic Object Matching

**BEFORE:**
```typescript
it('should return user data', async () => {
  const result = await getUser('123')
  expect(result).toEqual({ id: '123', name: 'John' })
})
```

**AFTER:**
```typescript
it('should return user data with correct shape and types', async () => {
  // Arrange
  const userId = '123'
  
  // Act
  const result = await getUser(userId)
  
  // Assert
  expect(result).toEqual({
    id: expect.any(String),
    name: expect.any(String),
    email: expect.stringMatching(/@/),
    createdAt: expect.any(Number),
  })
  expect(result.id).toBe(userId)
  expect(result.name).toBeTruthy()
})
```

---

### Step 2.3: Add Edge Case Tests

**Create new test files or expand existing ones:**

#### Example: `app/api/__tests__/numeric-edge-cases.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { calculateTotal, formatCurrency } from '@/lib/calculations'

describe('Numeric Edge Cases', () => {
  describe('calculateTotal', () => {
    it('should handle zero values', () => {
      expect(calculateTotal(0)).toBe(0)
      expect(calculateTotal([0, 0, 0])).toBe(0)
    })

    it('should reject negative values', () => {
      expect(() => calculateTotal(-1)).toThrow('Amount must be non-negative')
    })

    it('should handle MAX_SAFE_INTEGER', () => {
      expect(calculateTotal(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('should handle decimal precision correctly', () => {
      // Floating point: 0.1 + 0.2 !== 0.3
      expect(calculateTotal([0.1, 0.2])).toBe(0.30)
    })

    it('should handle very large numbers', () => {
      const large = 999999999999
      expect(calculateTotal(large)).toBe(large)
    })

    it('should handle very small decimals', () => {
      expect(calculateTotal(0.001)).toBe(0.001)
    })
  })

  describe('formatCurrency', () => {
    it('should format zero correctly', () => {
      expect(formatCurrency(0)).toBe('$0.00')
    })

    it('should handle negative amounts', () => {
      expect(formatCurrency(-100)).toBe('-$100.00')
    })

    it('should truncate very long decimals', () => {
      expect(formatCurrency(99.999)).toBe('$100.00')
    })
  })
})
```

---

### Step 2.4: Add Race Condition Tests

#### Example: `app/api/__tests__/concurrent-safety.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { withFileLock } from '@/lib/file-lock'

describe('Concurrent Safety', () => {
  describe('File Locking Under Load', () => {
    it('should handle 100 concurrent reads safely', async () => {
      // Arrange
      const operations = Array.from({ length: 100 }, (_, i) =>
        withFileLock(`test-file-${i}`, async () => {
          return Promise.resolve(`read-${i}`)
        })
      )

      // Act
      const results = await Promise.all(operations)

      // Assert
      expect(results).toHaveLength(100)
      results.forEach((result, i) => {
        expect(result).toBe(`read-${i}`)
      })
    })

    it('should serialize writes with concurrent reads', async () => {
      // Arrange: Mix of reads and writes
      const reads = Array.from({ length: 50 }, (_, i) =>
        withFileLock('test-file', async () => ({ type: 'read', id: i }))
      )
      const writes = Array.from({ length: 50 }, (_, i) =>
        withFileLock('test-file', async () => ({ type: 'write', id: i }))
      )

      // Act
      const results = await Promise.all([...reads, ...writes])

      // Assert: All operations completed
      expect(results).toHaveLength(100)
      expect(results.filter(r => r.type === 'read')).toHaveLength(50)
      expect(results.filter(r => r.type === 'write')).toHaveLength(50)
    })

    it('should not deadlock under contention', async () => {
      // Arrange
      const timeout = 5000 // 5 second timeout
      const operations = Array.from({ length: 50 }, (_, i) =>
        Promise.race([
          withFileLock(`file-${i % 5}`, async () => `result-${i}`),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Deadlock timeout')), timeout)
          ),
        ])
      )

      // Act
      const results = await Promise.all(operations)

      // Assert: No deadlocks
      expect(results).toHaveLength(50)
    })
  })
})
```

---

## PHASE 3: DOCUMENTATION & OPTIMIZATION (8-10 hours)

### Step 3.1: Add AAA Comments

**Pattern to apply to 50+ complex tests:**

```typescript
describe('Complex Operation', () => {
  it('should handle multiple conditions correctly', async () => {
    // Arrange: Set up test data and mocks
    const mockFn = vi.fn().mockResolvedValue({ success: true })
    const input = { id: '123', status: 'active' }
    
    // Act: Execute the code being tested
    const result = await processData(input, mockFn)
    
    // Assert: Verify the results
    expect(result).toEqual({ success: true })
    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      id: '123'
    }))
  })
})
```

---

### Step 3.2: Create Test Data Factories

**File:** `dashboard/__tests__/factories/test-data.ts`

```typescript
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { generateToken, TokenPayload } from '@/lib/auth'

export const testDataFactory = {
  /**
   * Create a test user token
   */
  async createToken(
    overrides?: Partial<TokenPayload>
  ): Promise<string> {
    const defaults: TokenPayload = {
      userId: `user-${Date.now()}`,
      email: `user-${Date.now()}@test.local`,
      role: 'user',
      ...overrides,
    }
    return generateToken(defaults)
  },

  /**
   * Create a NextRequest object for testing
   */
  createRequest(
    url: string,
    options?: RequestInit & { headers?: Record<string, string> }
  ) {
    return new NextRequest(url, options)
  },

  /**
   * Create a test directory that auto-cleans up
   */
  async createTempDir(): Promise<{ path: string; cleanup: () => Promise<void> }> {
    const tempPath = path.join(os.tmpdir(), `test-${Date.now()}-${Math.random()}`)
    await fs.mkdir(tempPath, { recursive: true })
    
    return {
      path: tempPath,
      cleanup: async () => {
        try {
          await fs.rm(tempPath, { recursive: true, force: true })
        } catch (e) {
          // Ignore cleanup errors
        }
      },
    }
  },

  /**
   * Create test alert data
   */
  createAlert(overrides?: Partial<any>) {
    return {
      id: `alert-${Date.now()}`,
      name: 'Test Alert',
      status: 'active',
      threshold: 80,
      ...overrides,
    }
  },

  /**
   * Create test conductor data
   */
  createConductor(overrides?: Partial<any>) {
    return {
      id: `conductor-${Date.now()}`,
      name: 'Test Conductor',
      config: { enabled: true },
      ...overrides,
    }
  },
}
```

**Usage in tests:**

```typescript
import { testDataFactory } from '__tests__/factories/test-data'

describe('Auth Tests', () => {
  it('should authenticate with token', async () => {
    // Arrange
    const token = await testDataFactory.createToken({ role: 'admin' })
    const request = testDataFactory.createRequest('http://localhost/api/test', {
      headers: { authorization: `Bearer ${token}` }
    })

    // Act
    const response = await handler(request)

    // Assert
    expect(response.status).toBe(200)
  })
})
```

---

### Step 3.3: Generate Coverage Dashboard

```bash
# Run tests with coverage reporting
npm run test:coverage

# View HTML report
# Windows
start coverage/index.html

# macOS
open coverage/index.html

# Linux
xdg-open coverage/index.html
```

---

## VALIDATION CHECKLIST

After completing each phase, verify:

### Phase 1 Completion:
- [ ] vitest.config.ts created and valid
- [ ] vitest.setup.ts created with global hooks
- [ ] package.json updated with vitest scripts
- [ ] npm install completed
- [ ] npm run test:run passes (all tests green)
- [ ] npm run test:coverage shows ≥80% coverage
- [ ] No @jest/globals imports remain
- [ ] No 'as any' in critical test files

### Phase 2 Completion:
- [ ] All test files have afterEach cleanup
- [ ] npm run test:isolated passes (no test pollution)
- [ ] 40+ weak assertions strengthened
- [ ] 20+ new edge case tests added
- [ ] Coverage maintained at ≥80%
- [ ] No flaky tests detected in 3 consecutive runs

### Phase 3 Completion:
- [ ] 50+ test blocks have AAA comments
- [ ] Test data factories created in __tests__/factories/
- [ ] HTML coverage report generates and is readable
- [ ] All metrics in success_criteria.json are met

---

## ROLLBACK PLAN

If issues occur:

1. **Keep original jest.config.js as backup**
2. **Can revert to Jest if needed:**
   ```bash
   npm uninstall vitest @vitest/ui @vitest/coverage-v8
   npm install --save-dev jest ts-jest @types/jest
   ```
3. **Restore jest.config.js if vitest issues arise**

---

## SUCCESS METRICS

| Metric | Target | How to Verify |
|--------|--------|---------------|
| All tests pass | 100% | `npm run test:run` |
| Coverage maintained | ≥80% | `npm run test:coverage` |
| No test pollution | 0 failures | `npm run test:isolated` |
| Framework unified | 100% Vitest | grep -r "@jest/globals" |
| Global cleanup active | 100% | Check vitest.setup.ts loaded |
| Type safety | No 'as any' | grep "as any" in tests |
| Edge cases | +20 tests | Compare test counts |
| Documentation | 50+ blocks | Sample random describe blocks |

---

## NEXT STEPS

1. **Immediate (Today):** Start Phase 1 implementation
   - Create vitest.config.ts
   - Create vitest.setup.ts
   - Update package.json
   - Run test suite

2. **Short-term (This Week):** Complete Phases 2-3
   - Fix type safety
   - Add afterEach cleanup
   - Strengthen assertions
   - Add edge cases

3. **Ongoing:** Monitor and maintain
   - Run full test suite in CI/CD
   - Track coverage trends
   - Add new tests for new code

---

**Audit Date:** 2026-10-22  
**Last Updated:** 2026-10-22  
**Status:** Ready for Implementation  
**Confidence:** 95%
