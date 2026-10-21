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
  // Regex: Requires 3+ character pattern NOT to repeat (prevents obvious patterns like test123test)
  // Pattern: ^(.{3,})(\d{0,9})?\1$
  // - ^(.{3,}) = capture 3+ character pattern
  // - (\d{0,9})? = optional 0-9 digits between patterns
  // - \1$ = pattern repeats at end
  regex: /^(.{3,})(\d{0,9})?\1$/,
  description: 'Password should not have obvious repeated patterns (e.g., "test123test")',
} as const
