/**
 * Jest Setup File
 * Initializes test environment with required configuration
 * This file runs before test suite execution
 */

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
})

// NOTE: Rate limit store reset is handled in individual test files via beforeEach hook
// to ensure proper import and isolation. See rate-limiting.test.ts for example.

// Global test timeout
jest.setTimeout(10000)

// Minimal jsdom polyfills for browser APIs jsdom does not implement.
// Guarded so node-environment suites are unaffected.
if (typeof window !== 'undefined') {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  }

  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = jest.fn()
  }
}
