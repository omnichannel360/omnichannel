# QA ACTION PLAN - PRIORITY FIXES

## TIER-1: CRITICAL (BLOCKS FEATURES) - Do This First

### 1. Fix Authentication System (2 hours)
**File**: `dashboard/auth.config.ts`  
**Lines**: 276-298 (validateUserCredentials function)

**Current Problem**:
```typescript
async function validateUserCredentials(email: string, password: string) {
  try {
    // TODO: Implement actual credential validation
    // This is a placeholder - replace with real user validation logic
    logger.warn('User credential validation not implemented', ...)
    return null  // ← BLOCKS ALL LOGINS
  }
}
```

**Required Fix**:
```typescript
async function validateUserCredentials(
  email: string,
  password: string
): Promise<{ id: string; email: string; role: 'admin' | 'user' | 'viewer' } | null> {
  try {
    // Option A: Validate against Supabase
    const { data, error } = await supabase
      .from('users')
      .select('id, email, password_hash, role')
      .eq('email', email)
      .single()
    
    if (error || !data) return null
    
    // Verify password (use bcrypt.compare for real implementation)
    const passwordValid = await bcrypt.compare(password, data.password_hash)
    if (!passwordValid) return null
    
    return {
      id: data.id,
      email: data.email,
      role: data.role || 'user'
    }
  } catch (error) {
    logger.error('User validation error', error, { email })
    return null
  }
}
```

**Test After**:
- [ ] Can login with valid credentials
- [ ] Cannot login with invalid credentials
- [ ] Error handling works
- [ ] Rate limiting applied

---

### 2. Fix AgentDossier Data Fetching (2 hours)
**File**: `dashboard/components/AgentDossier.tsx`  
**Lines**: 59-89 (metrics and activities)

**Current Problem**:
```typescript
const metrics: AgentMetrics = useMemo(() => ({
  tasksCompleted: 127,  // ← HARDCODED DEMO DATA
  successRate: 94.2,
  averageResponseTime: 1.2,
  lastActive: '2 minutes ago'
}), [agentId])
```

**Required Fix**:
```typescript
const metrics: AgentMetrics = useMemo(() => {
  // Fetch real metrics from API
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null)
  
  useEffect(() => {
    const fetchMetrics = async () => {
      const response = await fetch(`/api/agents/${agentId}/metrics`)
      if (response.ok) {
        setMetrics(await response.json())
      }
    }
    fetchMetrics()
  }, [agentId])
  
  return metrics || { /* fallback */ }
}, [agentId])
```

**Test After**:
- [ ] Metrics display real data
- [ ] Activity log shows actual agent actions
- [ ] Data updates when agentId changes
- [ ] Loading state works

---

## TIER-2: HIGH PRIORITY (TYPE SAFETY) - Do This Next

### 3. Replace Remaining Type Assertions (6-8 hours)
**Impact**: Prevents TypeScript from catching bugs

**Files to Review**:
1. `dashboard/lib/error-handling.ts` - ~8 instances
2. `dashboard/lib/validation/middleware.ts` - ~5 instances
3. `dashboard/app/api/brain/route.ts` - ~6 instances
4. Other routes - ~20 instances

**Pattern to Replace**:
```typescript
// BAD
const data = apiResponse as any
const value = data.field

// GOOD
interface ApiResponse {
  field: string
  // ... other fields
}
const data = apiResponse as ApiResponse
const value = data.field
```

---

### 4. Remove Console.log from Examples (0.5 hours)
**File**: `dashboard/examples/authenticated-requests.ts`

**Action**:
- Remove 6 console.log/error statements
- Move logging to test files if needed
- Keep this as a clean example without logging

---

## TIER-3: MEDIUM PRIORITY (INFRASTRUCTURE) - Do In Parallel

### 5. Add Pre-Commit Hooks (2 hours)
**Create**: `.husky/pre-commit`

```bash
#!/bin/sh
# Fail if console.log in non-test production code
git diff --cached --name-only | grep -E '\.(ts|tsx)$' | while read file; do
  if ! echo "$file" | grep -E '(__tests__|\.test\.|\.spec\.)' > /dev/null; then
    if git diff --cached "$file" | grep -E '^\+.*console\.(log|error|warn)' > /dev/null; then
      echo "ERROR: console.log found in production code: $file"
      exit 1
    fi
  fi
done

# Fail if TODO in critical files
if git diff --cached | grep -E '^\+.*TODO' | grep -E '(auth|security|validation)' > /dev/null; then
  echo "ERROR: Unresolved TODO in critical module"
  exit 1
fi
```

---

### 6. Create Error Code Registry (2 hours)
**Create**: `docs/ERROR_CODES.md`

**Template**:
```markdown
# API Error Codes

## 400 - Bad Request
- `INVALID_EMAIL`: Email format is invalid
- `INVALID_PASSWORD`: Password does not meet requirements
- `MISSING_FIELD`: Required field is missing

## 401 - Unauthorized
- `AUTH_MISSING`: No authentication token provided
- `AUTH_INVALID`: Token is invalid or expired
- `AUTH_INSUFFICIENT`: User lacks required permissions

## 500 - Server Error
- `DB_ERROR`: Database operation failed
- `EXTERNAL_API_ERROR`: External service unavailable
- `INTERNAL_ERROR`: Unexpected server error
```

---

## TIMELINE & EFFORT

| Phase | Task | Hours | Priority | Deadline |
|-------|------|-------|----------|----------|
| 1 | Fix auth validation | 2 | CRITICAL | Today |
| 1 | Fix AgentDossier data | 2 | CRITICAL | Today |
| 1 | Test end-to-end | 1 | CRITICAL | Today |
| **Phase 1 Total** | | **5 hours** | | **Today** |
| 2 | Replace type assertions | 8 | HIGH | This week |
| 2 | Remove console.log | 0.5 | HIGH | This week |
| 2 | Add error codes | 2 | HIGH | This week |
| **Phase 2 Total** | | **10.5 hours** | | **This week** |
| 3 | Pre-commit hooks | 2 | MEDIUM | Next week |
| 3 | Type coverage CI/CD | 2 | MEDIUM | Next week |
| 3 | Logging standards | 2 | MEDIUM | Next week |
| **Phase 3 Total** | | **6 hours** | | **Next week** |

**Total Estimated Effort**: 21.5 hours across 3 weeks

---

## QUALITY GATES

### Before Merging to Main
- [ ] All TIER-1 critical fixes implemented
- [ ] TIER-1 features tested end-to-end
- [ ] Code review completed
- [ ] All tests passing
- [ ] Type checking passes (tsc --strict)

### Before Shipping to Production
- [ ] TIER-1 and TIER-2 fixes merged
- [ ] Pre-commit hooks installed
- [ ] Error code registry deployed
- [ ] Security audit passing
- [ ] Performance testing completed

---

## SUCCESS METRICS

After completing all phases:
- Type assertion count: 111 → <10 (in non-critical paths)
- Console.log violations: 82 → 0 (in production)
- TODO markers: 12 → 0 (or all tracked with tickets)
- Authentication: Broken → Fully functional
- AgentDossier: Demo data → Real data
- Projected Sigma: 3.0 → 5.5 → 7.0+ (target)

---

## DO NOT FORGET

✅ **After Each Change**:
1. Run tests: `npm test`
2. Type check: `tsc --strict`
3. Lint: `eslint .`
4. Commit with clear messages

✅ **Communication**:
1. Update status in channel
2. Notify team of critical fixes
3. Tag reviewers for PRs
4. Document decisions in ADRs

✅ **Quality Verification**:
1. Manual testing of auth flow
2. Manual testing of agent dossier
3. Browser console check (no errors)
4. Network tab inspection

---

**Remember**: TIER-1 items are BLOCKING features. Complete these first.
