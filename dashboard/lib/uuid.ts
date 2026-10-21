/**
 * Browser-safe UUID v4 generator
 * Uses crypto.getRandomValues() when available, falls back to Math.random()
 */

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
  const placeholder = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  return placeholder.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Generate a unique UUID v4 identifier
 * @returns A RFC 4122 compliant UUID v4 string
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
