/**
 * Cryptographic Utilities
 * Re-exports from uuid.ts to avoid duplication
 * All ID generation uses generateUUIDv4() implementation
 */

import { generateUUIDv4 } from './uuid'
import { createLogger } from './logger'

const logger = createLogger('crypto-utils')

export { generateUUIDv4, generateId, generatePrefixedId } from './uuid'

/**
 * Aliases for backwards compatibility
 * FIXED: Moved require() to top-level import for better performance and consistency
 */
export function generateSecureRandomId(): string {
  return generateUUIDv4()
}

/**
 * Generates a random suffix using Math.random() - NOT cryptographically secure
 * SECURITY WARNING: Only use for non-security-critical purposes (e.g., UI identifiers, debug IDs)
 * FIXED: Added security logging when this is called
 */
export function generateNonCryptoRandomSuffix(): string {
  logger.warn('Using non-cryptographic random generator - only use for non-security purposes')
  return Math.random().toString(36).substring(2, 11)
}
