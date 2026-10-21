/**
 * Jest Setup File
 * Initializes test environment with required configuration
 * This file runs before test suite execution
 */

// Polyfill global fetch for Node.js test environment (Node 18+ has it, but ensure availability)
if (typeof global.fetch === 'undefined') {
  // For Node < 18 compatibility, import node-fetch or use jest-fetch-mock
  // For now, we assume Node 18+ which has native fetch support
  global.fetch = fetch
}

// Set JWT_SECRET for authentication tests
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-key-at-least-256-bits-long-for-security'
}

// Set Node environment
process.env.NODE_ENV = 'test'

// Suppress console output in tests (optional - remove if you want to see logs)
// jest.spyOn(console, 'log').mockImplementation(() => {})
// jest.spyOn(console, 'warn').mockImplementation(() => {})

// Add custom matchers if needed
expect.extend({
  toBeValidJSON(received: unknown) {
    if (typeof received !== 'string') {
      return {
        pass: false,
        message: () => `Expected string, got ${typeof received}`,
      }
    }

    try {
      JSON.parse(received)
      return {
        pass: true,
        message: () => 'Expected invalid JSON',
      }
    } catch {
      return {
        pass: false,
        message: () => `Expected valid JSON, got parse error`,
      }
    }
  },
  toStartWith(received: unknown, expected: string) {
    if (typeof received !== 'string') {
      return {
        pass: false,
        message: () => `Expected string, got ${typeof received}`,
      }
    }
    const pass = received.startsWith(expected)
    return {
      pass,
      message: () => pass
        ? `Expected string not to start with "${expected}"`
        : `Expected string to start with "${expected}", but got "${received}"`,
    }
  },
})

// Global test timeout
jest.setTimeout(10000)
