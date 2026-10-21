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

    return [
      array[0].toString(16).padStart(2, '0'),
      array[1].toString(16).padStart(2, '0'),
      array[2].toString(16).padStart(2, '0'),
      array[3].toString(16).padStart(2, '0'),
      array[4].toString(16).padStart(2, '0'),
      array[5].toString(16).padStart(2, '0'),
      array[6].toString(16).padStart(2, '0'),
      array[7].toString(16).padStart(2, '0'),
      '-',
      array[8].toString(16).padStart(2, '0'),
      array[9].toString(16).padStart(2, '0'),
      '-',
      array[10].toString(16).padStart(2, '0'),
      array[11].toString(16).padStart(2, '0'),
      '-',
      array[12].toString(16).padStart(2, '0'),
      array[13].toString(16).padStart(2, '0'),
      '-',
      array[14].toString(16).padStart(2, '0'),
      array[15].toString(16).padStart(2, '0'),
    ].join('')
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
