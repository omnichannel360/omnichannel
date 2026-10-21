# ACTION PLAN — Critical Fixes Required
**Status:** 4 MUST-FIX issues in current uncommitted changes  
**Estimated Time:** 45 minutes to fix all

---

## IMMEDIATE FIXES (Before Any Commit)

### 1. Fix jest.setup.js (5 min)

**Current (BROKEN):**
```javascript
// Setup file for Jest - optional testing library extensions
try {
  require('@testing-library/jest-dom')
} catch (e) {
  // @testing-library/jest-dom is optional - skip if not installed
}
```

**Replace with:**
```javascript
// Setup file for Jest - optional testing library extensions
try {
  const path = require('path')
  const testingLibraryPath = require.resolve('@testing-library/jest-dom')
  require(testingLibraryPath)
} catch (e) {
  // @testing-library/jest-dom is optional - skip if not installed
  console.warn('Testing library not installed, skipping matchers setup')
}
```

**Verification:**
```bash
npm run test -- --listTests  # Should find tests without errors
```

---

### 2. Fix crypto-utils.ts (10 min)

**Current (BROKEN):**
```typescript
// Lines 7-32 — getLogger() with console.warn fallback
let logger: any = null
function getLogger() {
  if (!logger) {
    try {
      const loggerModule = require('./logger')
      logger = loggerModule.createLogger('crypto-utils')
    } catch {
      // Fallback if logger cannot be loaded
      return {
        warn: (message: string, context?: any) => {
          // ...
          console.warn('[WARN]', logEntry)  // ← WRONG
        }
      }
    }
  }
  return logger
}

// Line 59: Uses getLogger() which falls back to console.warn
getLogger().warn('[SECURITY] generateSecureRandomId...')
```

**Replace with:**
```typescript
import { createLogger } from './logger'

const logger = createLogger('crypto-utils')

// Then on line 59, just use:
logger.warn('[SECURITY] generateSecureRandomId: Using non-secure Math.random() fallback. Consider upgrading Node.js to 15+ or using browser crypto APIs.')
```

**What to Change:**
1. Delete lines 7-32 (the getLogger function)
2. Add `import { createLogger } from './logger'` at top
3. Add `const logger = createLogger('crypto-utils')` after imports
4. Change line 59 from `getLogger().warn(...)` to `logger.warn(...)`

---

### 3. Fix uuid.ts (10 min)

**Same pattern as crypto-utils.ts:**

**Current (BROKEN):**
```typescript
// Lines 6-31 — Same getLogger() pattern
let logger: any = null
function getLogger() {
  if (!logger) {
    try {
      const loggerModule = require('./logger')
      logger = loggerModule.createLogger('uuid')
    } catch {
      return {
        warn: (message: string, context?: any) => {
          console.warn('[WARN]', logEntry)  // ← WRONG
        }
      }
    }
  }
  return logger
}

// Line 34 (inferred): getLogger().warn(...)
```

**Replace with:**
```typescript
import { createLogger } from './logger'

const logger = createLogger('uuid')

// Then use: logger.warn(...)
```

**What to Change:**
1. Delete lines 6-31 (the getLogger function)
2. Add `import { createLogger } from './logger'` at top
3. Add `const logger = createLogger('uuid')` after imports
4. Find all getLogger().warn(...) calls and change to logger.warn(...)

---

### 4. Fix health/route.ts Alert Format (10 min)

**Decision Required:**

**Option A: Revert to emoji format** (Recommended for backward compatibility)
```typescript
// Lines 185-189 — Change from:
const ALERT_LEVELS = {
  INFO: '[INFO]',
  WARNING: '[WARNING]',
  ERROR: '[ERROR]',
}

// To:
const ALERT_LEVELS = {
  INFO: 'ℹ️',
  WARNING: '⚠️',
  ERROR: '❌',
}
```

**Option B: Keep text format** (Update all downstream systems)
If you keep the `[INFO]`, `[WARNING]`, `[ERROR]` format, you MUST also:
- Update any dashboard code that parses alerts for emoji
- Update monitoring integrations
- Update alert routing rules
- Document the format change for clients

**Recommendation:** Use **Option A** (emoji format) unless you own and can update all downstream systems simultaneously.

---

## VERIFICATION STEPS

After fixing all 4 issues, run:

```bash
# 1. Type check
npm run type-check

# 2. Run tests
npm run test:coverage

# 3. Check for console violations
grep -r "console\." dashboard/lib dashboard/app/api --include="*.ts" --include="*.tsx" | grep -v ".test.ts" | grep -v "jest.setup"

# 4. Verify no regressions
npm run test -- --verbose
```

**Expected Results:**
- ✅ No TypeScript errors
- ✅ All tests pass
- ✅ No console.log/warn in production code (except jest.setup.js)
- ✅ Coverage ≥ 80%

---

## COMMIT MESSAGE (After Fixes)

```
fix: Restore logger compliance and fix test initialization

- Fix jest.setup.js async IIFE to properly load testing library
- Restore logger.warn() usage in crypto-utils.ts (revert console regression)
- Restore logger.warn() usage in uuid.ts (revert console regression)
- Revert alert format to emoji for backward compatibility

Fixes regression from commits 654ccae and 4cddf5d where console.warn
replaced structured logger and lazy-load pattern was removed without
fixing root cause circular dependency.

Ensures CLAUDE.md compliance: No console logging in production code.
Maintains backward compatibility with existing alert parsing systems.
```

---

## FOLLOW-UP WORK (After These Fixes)

**BEFORE PRODUCTION:**
1. Fix duplicate sanitizeString() XSS vulnerability (CRITICAL)
2. Consolidate schema definitions (HIGH)
3. Fix password schema weakness (HIGH)

**NEXT SPRINT:**
1. Add pre-commit hook to catch console.log/warn
2. Add schema consolidation to code review checklist
3. Document validation patterns

---

**Total Fix Time:** 45 minutes  
**Risk Level:** Low (all fixes are reversions or clarifications, not new features)  
**Testing Required:** Yes (full test suite + manual verification)

Run these fixes in order. Stop after each fix to verify no new errors.
