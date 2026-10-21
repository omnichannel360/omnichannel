/**
 * Cryptographic Utilities
 * Provides secure random ID generation with fallback strategy
 * NOTE: Fallback to Math.random is NOT cryptographically secure
 */

// Use dynamic require to avoid circular dependency with logger
let logger: any = null
function getLogger() {
  if (!logger) {
    try {
      const loggerModule = require('./logger')
      logger = loggerModule.createLogger('crypto-utils')
    } catch {
      // Fallback if logger cannot be loaded - create minimal structured logger
      logger = {
        warn: (message: string, context?: any) => {
          const timestamp = new Date().toISOString()
          const logEntry = { timestamp, level: 'WARN', module: 'crypto-utils', message, ...context }
          // Write to stderr to avoid mixing with stdout
          if (typeof process !== 'undefined' && process.stderr) {
            process.stderr.write(JSON.stringify(logEntry) + '\n')
          } else if (typeof console !== 'undefined') {
            // Browser fallback - still use console but structured
            console.warn('[WARN]', logEntry)
          }
        }
      }
    }
  }
  return logger
}

/**
 * Generate a cryptographically secure random ID
 *
 * PRIORITY ORDER (uses first available):
 * 1. crypto.randomUUID() - Node.js 15+ (preferred)
 * 2. crypto.getRandomValues() - Browser (fallback)
 * 3. Math.random() - Last resort, NOT SECURE for cryptographic use
 *
 * @returns 36-character UUID or fallback string
 * @throws Error if called in unsupported environment
 */
export function generateSecureRandomId(): string {
  // Node.js 15+: crypto.randomUUID()
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // Browser: crypto.getRandomValues()
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }

  // FALLBACK: This is NOT cryptographically secure
  // Use only as last resort; prefer upgrading to Node.js 15+ or using browser APIs
  getLogger().warn('[SECURITY] generateSecureRandomId: Using non-secure Math.random() fallback. Consider upgrading Node.js to 15+ or using browser crypto APIs.')
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Generate a correlation ID combining timestamp with secure random component
 * Format: "req-<timestamp>-<random-part>"
 *
 * @returns Correlation ID string
 */
export function generateCorrelationId(): string {
  const randomPart = generateSecureRandomId()
  return `req-${Date.now()}-${randomPart}`
}

/**
 * Generate a short random suffix (NOT cryptographically secure)
 * Use only for non-security purposes like breadcrumb IDs
 *
 * @returns 12-character hex string
 */
export function generateNonCryptoRandomSuffix(): string {
  // For non-security purposes, shorter Math.random suffix is acceptable
  return Math.random().toString(36).substring(2, 11)
}
