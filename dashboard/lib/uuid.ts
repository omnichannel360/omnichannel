/**
 * Browser-safe UUID v4 generator
 * Uses crypto.getRandomValues() when available, falls back to Math.random()
 */

import type { Logger } from './logger'

// Use dynamic require to avoid circular dependency with logger
let logger: Logger | null = null
function getLogger() {
  if (!logger) {
    try {
      const loggerModule = require('./logger')
      logger = loggerModule.createLogger('uuid')
    } catch {
      // Fallback if logger cannot be loaded - create minimal structured logger
      logger = {
        warn: (message: string, context?: Record<string, unknown>) => {
          const timestamp = new Date().toISOString()
          const logEntry = { timestamp, level: 'WARN', module: 'uuid', message, ...(context || {}) }
          // Use console only - process.stderr not available in Edge Runtime
          if (typeof console !== 'undefined') {
            console.warn('[WARN]', logEntry)
          }
        }
      } as Logger
    }
  }
  return logger
}

export function generateUUIDv4(): string {
  // Use native crypto.getRandomValues if available (Node.js 15+, modern browsers)
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

  // Fallback for environments without crypto.getRandomValues
  // This is less secure but ensures the function works everywhere
  // WARNING: NOT cryptographically secure, use only as last resort
  const fallbackLogger = getLogger()
  if (fallbackLogger) {
    fallbackLogger.warn('[SECURITY] generateUUIDv4: Using non-secure Math.random() fallback. Consider using Node.js 15+ or modern browser crypto APIs.')
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
