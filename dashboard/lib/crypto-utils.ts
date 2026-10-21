/**
 * Cryptographic Utilities
 * Re-exports from uuid.ts to avoid duplication
 * All ID generation uses generateUUIDv4() implementation
 *
 * FIXED: Lazy-load logger to avoid circular dependency
 */

import type { Logger } from './logger'
import { generateUUIDv4 } from './uuid'

let logger: Logger | null = null
let nonCryptoWarningLogged = false

function getLogger() {
  if (!logger) {
    try {
      const { createLogger } = require('./logger')
      logger = createLogger('crypto-utils')
    } catch {
      logger = {
        warn: (msg: string) => {
          if (typeof console !== 'undefined') {
            console.warn('[crypto-utils]', msg)
          }
        },
      }
    }
  }
  return logger
}

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
 * FIXED: Uses lazy-loaded logger to avoid circular dependency, warning logged only once per session
 */
export function generateNonCryptoRandomSuffix(): string {
  if (!nonCryptoWarningLogged) {
    getLogger().warn('Using non-cryptographic random generator - only use for non-security purposes')
    nonCryptoWarningLogged = true
  }
  return Math.random().toString(36).substring(2, 11)
}
