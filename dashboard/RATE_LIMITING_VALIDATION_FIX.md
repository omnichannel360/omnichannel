# Rate Limiting & Input Validation - Comprehensive Fix

## Task Overview
- Implement express-rate-limit (or enhance existing in-memory solution)
- Add zod schemas for validation
- Validate enum values
- Add comprehensive input checks to all API routes

## Project: OmniCompany Dashboard (Next.js)
- Package: Already has zod@3.25.76
- Rate Limiting: Custom in-memory implementation exists
- Need: Comprehensive validation across all 11+ endpoints

---

## PARALLEL AGENT ASSIGNMENTS

### AGENT 1: RATE-LIMIT-AGENT
**Task**: Enhance rate limiting across all endpoints
- [ ] Review current rate limiting configuration in lib/rate-limiting.ts
- [ ] Ensure all 11 API endpoints use applyRateLimit()
- [ ] Tune rate limits per endpoint:
  - Auth (login/verify): 5 req/min per IP
  - Public endpoints (health): 100 req/min per IP
  - Protected endpoints (alerts, brain, etc): 20 req/min per user
- [ ] Add rate limit headers to all responses (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
- [ ] Test rate limiting enforcement

### AGENT 2: INPUT-VALIDATION-AGENT
**Task**: Create comprehensive zod schemas and integrate
- [ ] Audit all endpoints for missing schemas
- [ ] Create complete schemas for:
  - /api/alerts (GET, POST, PUT)
  - /api/auth/login (POST)
  - /api/auth/verify (POST)
  - /api/brain (GET with query params)
  - /api/conductor (POST)
  - /api/health (GET)
  - /api/kanban (GET, POST, PUT)
  - /api/meetings (GET, POST, DELETE)
  - /api/metrics (GET)
  - /api/profiles (GET, PUT)
- [ ] Add request body validation to all POST/PUT endpoints
- [ ] Add query parameter validation to all GET endpoints
- [ ] Create unified validation response handler

### AGENT 3: ENUM-VALIDATOR-AGENT
**Task**: Add strict enum validation
- [ ] Review all enum fields in schemas:
  - AlertLevel: 'info' | 'warning' | 'critical'
  - AlertStatus: 'active' | 'resolved'
  - MeetingStatus: 'scheduled' | 'completed' | 'failed'
  - TaskStatus: 'todo' | 'in-progress' | 'done'
  - HealthStatus: 'healthy' | 'degraded' | 'unhealthy'
  - ComponentStatus: 'operational' | 'no_activity' | 'logging' | 'inactive' | 'loaded' | 'missing'
- [ ] Use z.enum() for strict validation
- [ ] Add enum validation tests
- [ ] Ensure database/file operations respect enums

### AGENT 4: COVERAGE-AGENT
**Task**: Verify complete coverage and create tests
- [ ] Audit all 11+ endpoints:
  1. /api/alerts/route.ts
  2. /api/auth/login/route.ts
  3. /api/auth/route.ts
  4. /api/auth/verify/route.ts
  5. /api/brain/route.ts
  6. /api/conductor/route.ts
  7. /api/health/route.ts
  8. /api/kanban/route.ts
  9. /api/meetings/route.ts
  10. /api/metrics/route.ts
  11. /api/profiles/route.ts
- [ ] Verify each has:
  - Rate limiting applied
  - Input validation (body + query params)
  - Enum validation where applicable
  - Error handling with proper codes
  - Proper logging
- [ ] Create comprehensive test suite:
  - Rate limit bypass attempts
  - Invalid enum values
  - Missing required fields
  - XSS/injection attempts
- [ ] Document integration points

---

## FILES TO CREATE/MODIFY

### NEW FILES
1. `lib/validation/schemas/endpoints.ts` - Comprehensive endpoint schemas
2. `lib/validation/schemas/enums.ts` - Strict enum definitions
3. `lib/validation/middleware/comprehensive-validation.ts` - Unified validation handler
4. `app/api/__tests__/rate-limiting.comprehensive.test.ts` - Rate limit tests
5. `app/api/__tests__/input-validation.comprehensive.test.ts` - Validation tests
6. `app/api/__tests__/enum-validation.comprehensive.test.ts` - Enum tests

### MODIFIED FILES
1. `lib/rate-limiting.ts` - Enhance limits and headers
2. `lib/input-validation.ts` - Add comprehensive schemas
3. All `app/api/*/route.ts` files - Integrate validation

---

## ACCEPTANCE CRITERIA

✅ All endpoints have rate limiting (checked)
✅ All endpoints validate request body (if POST/PUT)
✅ All endpoints validate query params (if GET with params)
✅ All enum values are strictly validated with z.enum()
✅ Rate limit headers present in all responses
✅ Validation failures return 400 with clear error messages
✅ Test coverage >= 80% for all validation logic
✅ No endpoint accepts undefined/invalid enum values
✅ All tests pass
✅ No TypeScript errors

---

## DEPLOYMENT CHECKLIST

- [ ] All tests pass
- [ ] No TypeScript compilation errors
- [ ] Rate limiting is tuned for production
- [ ] No console.log in production code
- [ ] Security review completed (no hardcoded values)
- [ ] Documentation updated
- [ ] Git commit with conventional message

---

## EXECUTION STATUS

**Status**: PENDING (Awaiting agent execution)

**Agent Progress**:
- [ ] RATE-LIMIT-AGENT: START
- [ ] INPUT-VALIDATION-AGENT: START
- [ ] ENUM-VALIDATOR-AGENT: START
- [ ] COVERAGE-AGENT: START

**Timeline**: Target completion: 2 hours parallel execution

---

Generated: 2026-10-22 01:25:00 UTC
Workflow: Parallel Agent Execution
