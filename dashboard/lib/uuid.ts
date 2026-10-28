/**
 * Browser-safe UUID v4 generator
 * Uses crypto.getRandomValues() when available, falls back to Math.random()
 */

import type { Logger } from './logger'

// Cache crypto module at module load time (FIXED: avoid require() on every call)
let nodeCrypto: { randomUUID?: () => string } | null = null
let cryptoInitialized = false

// Use dynamic require to avoid circular dependency with logger
let logger: Logger | null = null
function getLogger() {
  if (!logger) {
    try {
      const loggerModule = require('./logger')
      logger = loggerModule.createLogger('uuid')
    } catch {
      // Fallback if logger cannot be loaded - no-op to avoid console pollution
      logger = {
        serviceName: 'uuid',
        enableDebug: false,
        minLevel: 'info',
        levels: { debug: 0, info: 1, warn: 2, error: 3 },
        setMinLevel: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        logOperation: () => {}
      } as unknown as Logger
    }
  }
  return logger
}

// Initialize crypto module once at module load (FIXED: cache for performance)
function initializeCrypto(): void {
  if (cryptoInitialized) return
  cryptoInitialized = true
  try {
    nodeCrypto = require('crypto') as { randomUUID?: () => string }
  } catch {
    nodeCrypto = null
  }
}

export function generateUUIDv4(): string {
  // PRIORITY 1: Use Node.js native crypto.randomUUID() (fastest, most secure)
  // Available in Node.js 15.7+, uses OS entropy pool
  if (!cryptoInitialized) {
    initializeCrypto()
  }

  if (nodeCrypto?.randomUUID && typeof nodeCrypto.randomUUID === 'function') {
    try {
      return nodeCrypto.randomUUID()
    } catch {
      // Fall through to next option
    }
  }

  // PRIORITY 2: Use browser/universal crypto.getRandomValues (modern browsers)
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const array = new Uint8Array(16)
    globalThis.crypto.getRandomValues(array)

    // Set version (4) and variant (RFC 4122) bits
    array[6] = (array[6] & 0x0f) | 0x40
    array[8] = (array[8] & 0x3f) | 0x80

    // Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const hex = Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
    return [
      hex.substring(0, 8),
      hex.substring(8, 12),
      hex.substring(12, 16),
      hex.substring(16, 20),
      hex.substring(20, 32),
    ].join('-')
  }

  // PRIORITY 3: Fallback for environments without crypto (development only)
  // This is NOT cryptographically secure, use only as last resort
  const fallbackLogger = getLogger()
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction) {
    // SECURITY: Throw error in production - don't silently fail
    throw new Error('[CRITICAL] generateUUIDv4: Cryptographically insecure UUID generation blocked in production. This environment lacks crypto.randomUUID() (Node.js 15.7+) and crypto.getRandomValues(). Ensure Node.js 15+ is deployed.')
  } else {
    // Development environment - just a warning, then use fallback
    fallbackLogger?.warn('[SECURITY] generateUUIDv4: Using non-secure Math.random() fallback. For production, ensure Node.js 15+ or modern browser crypto APIs are available.', {
      component: 'uuid'
    })
  }

  const placeholder = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  return placeholder.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Generate a unique UUID v4 identifier without prefix
 * @returns A RFC 4122 compliant UUID v4 string (e.g., '550e8400-e29b-41d4-a716-446655440000')
 *
 * Use this for unprefixed IDs. For prefixed IDs, use generatePrefixedId() instead.
 *
 * Example: const id = generateId() // "550e8400-e29b-41d4-a716-446655440000"
 */
export function generateId(): string {
  return generateUUIDv4()
}

/**
 * Generate a prefixed UUID for better categorization
 * @param prefix - String prefix for the ID (e.g., 'msg', 'task')
 * @returns A prefixed UUID (e.g., 'msg_550e8400-e29b-41d4-a716-446655440000')
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}_${generateUUIDv4()}`
}
