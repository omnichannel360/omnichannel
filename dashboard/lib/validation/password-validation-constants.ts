/**
 * Shared Password Validation Constants
 * Single source of truth for password validation across all endpoints
 * Ensures consistent validation logic between frontend and backend
 *
 * FIXED: Consolidated from duplicate definitions in:
 * - dashboard/lib/input-validation.ts (line 63)
 * - dashboard/lib/validation/schemas.ts (line 28)
 */

export const PASSWORD_VALIDATION = {
  minLength: 8,
  maxLength: 128,
  // FIXED: Regex now correctly detects obvious repeated patterns with optional digits
  // This regex MATCHES weak patterns (so we REJECT them with .refine())
  // Pattern: ^(.{3,})[\d\s]*\1$ matches: word + optional digits/spaces + same word
  // Examples that MATCH (and get rejected):
  //   - "test123test"
  //   - "word456word"
  //   - "abc789abc"
  // Examples that DON'T match (and are allowed):
  //   - "test123testing" (not exactly repeated)
  //   - "MyPassword123!" (no repetition)
  regex: /^(.{3,})[\d\s]*\1$/i,
  description: 'Password should not have obvious repeated patterns (e.g., "test123test")',
} as const
