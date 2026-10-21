/**
 * Cryptographic Utilities
 * Re-exports from uuid.ts to avoid duplication
 * All ID generation uses generateUUIDv4() implementation
 */

import { generateUUIDv4 } from './uuid'

export { generateUUIDv4, generateId, generatePrefixedId } from './uuid'

/**
 * Aliases for backwards compatibility
 * FIXED: Moved require() to top-level import for better performance and consistency
 */
export function generateSecureRandomId(): string {
  return generateUUIDv4()
}

export function generateNonCryptoRandomSuffix(): string {
  return Math.random().toString(36).substring(2, 11)
}
