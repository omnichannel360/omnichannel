/**
 * Cryptographic Utilities
 * Re-exports from uuid.ts to avoid duplication
 * All ID generation uses generateUUIDv4() implementation
 *
 * NOTE: Uses dynamic require() for logger to avoid circular dependency.
 * Fallback console implementation available for scenarios where logger cannot be loaded.
 */

import type { Logger } from './logger'
import { generateUUIDv4 } from './uuid'

// Fallback logger implementation for circular dependency scenarios
const createFallbackLogger = (): Logger => ({
  debug: (msg: string, context?: Record<string, unknown>) => {
    if (typeof console !== 'undefined') {
      console.debug('[crypto-utils]', msg, context)
    }
  },
  info: (msg: string, context?: Record<string, unknown>) => {
    if (typeof console !== 'undefined') {
      console.info('[crypto-utils]', msg, context)
    }
  },
  warn: (msg: string, context?: Record<string, unknown>) => {
    if (typeof console !== 'undefined') {
      console.warn('[crypto-utils]', msg, context)
    }
  },
  error: (msg: string, error?: unknown, context?: Record<string, unknown>) => {
    if (typeof console !== 'undefined') {
      console.error('[crypto-utils]', msg, error, context)
    }
  },
})

// Cache fallback logger to avoid recreating on each call
let fallbackLoggerCache: Logger | null = null

let logger: Logger | null = null
let nonCryptoWarningLogged = false

// Try to use the real logger, fall back to console if not available
let loggerInitialized = false
function getLogger(): Logger {
  if (!loggerInitialized) {
    loggerInitialized = true
    try {
      // Delay import to avoid circular dependency at module load time
      const loggerModule = require('./logger')
      if (loggerModule?.createLogger) {
        logger = loggerModule.createLogger('crypto-utils')
      }
    } catch {
      // Circular dependency detected - use fallback
    }
  }
  if (!logger) {
    if (!fallbackLoggerCache) {
      fallbackLoggerCache = createFallbackLogger()
    }
    return fallbackLoggerCache
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
    try {
      getLogger().warn('Using non-cryptographic random generator - only use for non-security purposes')
    } catch {
      // Silently fail if logger unavailable - this is non-critical path
    }
    nonCryptoWarningLogged = true
  }
  return Math.random().toString(36).substring(2, 11)
}
