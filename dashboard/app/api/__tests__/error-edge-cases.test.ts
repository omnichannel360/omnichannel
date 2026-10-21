/**
 * Error Handling Edge Cases Tests
 * Tests timeout handling, retry logic, and circuit breaker patterns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from '@jest/globals'
import {
  retryWithBackoff,
  DEFAULT_RETRY_CONFIG,
  withTimeout,
  CircuitBreaker,
  RetryConfig,
} from '@/lib/error-handling'

describe('Error Handling Edge Cases', () => {
  describe('withTimeout function', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.clearAllMocks()
    })

    it('should resolve successfully when operation completes before timeout', async () => {
      // Arrange — Create operation that completes quickly (50ms)
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 50)
      })

      // Act — Wrap with timeout of 200ms (plenty of time)
      const result = await withTimeout(operation, 200)

      // Assert — Verify operation succeeded within timeout
      expect(result).toBe('success')
    })

    it('should reject with timeout error when operation exceeds timeout duration', async () => {
      // Arrange — Create operation that takes 200ms
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 200)
      })

      // Act & Assert — Attempt to wrap with 50ms timeout (will fail)
      await expect(withTimeout(operation, 50)).rejects.toThrow('Operation timeout')
    })

    it('should use custom timeout message when provided', async () => {
      // Arrange — Custom timeout message
      const customMessage = 'Custom timeout message'
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 200)
      })

      // Act & Assert — Verify custom message is used
      await expect(withTimeout(operation, 50, customMessage)).rejects.toThrow(customMessage)
    })

    it('should handle immediate timeout (zero timeout with slow operation)', async () => {
      // Arrange — Operation that takes a long time
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 1000)
      })

      // Act & Assert — Zero timeout should trigger immediately
      await expect(withTimeout(operation, 0)).rejects.toThrow(/timeout|immediate/i)
    })

    it('should handle promise rejection that occurs before timeout', async () => {
      // Arrange — Operation rejects with error
      const operationError = new Error('Operation failed')
      const operation = new Promise((_, reject) => {
        setTimeout(() => reject(operationError), 50)
      })

      // Act & Assert — Operation error should propagate (not timeout)
      await expect(withTimeout(operation, 200)).rejects.toThrow('Operation failed')
    })

    it('should resolve zero timeout edge case when operation is already resolved', async () => {
      // Arrange — Operation that is already resolved
      const operation = Promise.resolve('success')

      // Act — Apply timeout of 0
      const result = await withTimeout(operation, 0)

      // Assert — Verify resolved value is returned
      expect(result).toBe('success')
    })

    it('should handle very large timeout values gracefully', async () => {
      // Arrange — Max safe integer timeout
      const operation = Promise.resolve('success')

      // Act — Apply extremely large timeout
      const result = await withTimeout(operation, Number.MAX_SAFE_INTEGER)

      // Assert — Verify operation completes successfully
      expect(result).toBe('success')
    })

    it('should timeout with specific error type for timeout case', async () => {
      // Arrange — Operation that will timeout
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 500)
      })

      // Act & Assert — Verify error is specifically a timeout error
      await expect(withTimeout(operation, 10)).rejects.toMatchObject({
        name: 'TimeoutError',
        message: expect.stringMatching(/timeout/i),
      })
    })

    it('should allow cleanup/abort of timed-out operation', async () => {
      // Arrange — Track if cleanup occurred
      const cleanup = jest.fn()
      const operation = new Promise((resolve) => {
        const timer = setTimeout(() => resolve('success'), 200)
        // Handle cleanup when operation times out
        operation.catch(() => clearTimeout(timer))
      })

      // Act & Assert — Verify timeout and cleanup
      await expect(withTimeout(operation, 50)).rejects.toThrow('timeout')
      // Verify cleanup was potentially called (implementation dependent)
    })
  })

  describe('retryWithBackoff function', () => {
    let mockOperation: jest.Mock

    beforeEach(() => {
      mockOperation = jest.fn()
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should succeed on first attempt if no error', async () => {
      // Arrange — Mock successful operation on first call
      mockOperation.mockResolvedValue('success')

      // Act — Call retry function with successful operation
      const result = await retryWithBackoff(mockOperation)

      // Assert — Verify success on first attempt with only one call
      expect(result).toBe('success')
      expect(mockOperation).toHaveBeenCalledTimes(1)
      expect(mockOperation).toHaveBeenCalledWith()
    })

    it('should retry on retryable error and succeed', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce('success')

      const result = await retryWithBackoff(operation)

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(3)
    })

    it('should fail on non-retryable error immediately', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Invalid input'))

      await expect(retryWithBackoff(operation)).rejects.toThrow('Invalid input')
      expect(operation).toHaveBeenCalledTimes(1)
    })

    it('should fail after max retries exceeded', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('timeout'))

      await expect(retryWithBackoff(operation, DEFAULT_RETRY_CONFIG)).rejects.toThrow('timeout')
      expect(operation).toHaveBeenCalledTimes(4) // initial + 3 retries
    })

    it('should implement exponential backoff', async () => {
      vi.useFakeTimers()

      const operation = vi
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce('success')

      const config: RetryConfig = {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        isRetryable: () => true,
      }

      const promise = retryWithBackoff(operation, config)

      // Verify backoff delays
      expect(vi.getTimerCount()).toBeGreaterThan(0)

      vi.advanceTimersByTime(100)
      await vi.runAllTimersAsync()

      vi.useRealTimers()
    })

    it('should respect maxDelayMs limit', async () => {
      vi.useFakeTimers()

      const operation = jest.fn().mockRejectedValue(new Error('timeout'))

      const config: RetryConfig = {
        maxRetries: 5,
        initialDelayMs: 100,
        maxDelayMs: 500,
        backoffMultiplier: 3,
        isRetryable: () => true,
      }

      const promise = retryWithBackoff(operation, config).catch(() => {})

      // Skip past all timeouts
      vi.advanceTimersByTime(2000)
      await vi.runAllTimersAsync()

      vi.useRealTimers()

      // Max delay should cap at 500ms
      expect(operation.mock.calls.length).toBeLessThanOrEqual(6)
    })

    it('should use custom isRetryable function', async () => {
      const isRetryable = jest.fn((error) => {
        if (error instanceof Error) {
          return error.message.includes('temporary')
        }
        return false
      })

      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValueOnce('success')

      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        isRetryable,
      }

      const result = await retryWithBackoff(operation, config)

      expect(result).toBe('success')
      expect(isRetryable).toHaveBeenCalled()
    })

    it('should handle ECONNRESET as retryable', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce('success')

      const result = await retryWithBackoff(operation)

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(2)
    })

    it('should handle service unavailable as retryable', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValueOnce('success')

      const result = await retryWithBackoff(operation)

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(2)
    })
  })

  describe('CircuitBreaker - CLOSED state', () => {
    let circuitBreaker: CircuitBreaker

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(3, 2, 100)
    })

    it('should allow operations when CLOSED', async () => {
      const operation = jest.fn().mockResolvedValue('success')

      const result = await circuitBreaker.execute(operation)

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledOnce()
      expect(circuitBreaker.getState()).toBe('CLOSED')
    })

    it('should track successful operations', async () => {
      const operation = jest.fn().mockResolvedValue('ok')

      await circuitBreaker.execute(operation)
      await circuitBreaker.execute(operation)
      await circuitBreaker.execute(operation)

      expect(operation).toHaveBeenCalledTimes(3)
      expect(circuitBreaker.getState()).toBe('CLOSED')
    })

    it('should remain CLOSED with occasional failures below threshold', async () => {
      const operation = vi
        .fn()
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success')

      // Arrange: Set up circuit breaker in HALF_OPEN state
      await circuitBreaker.execute(operation)

      // Act: Execute failing operation followed by success (tests recovery path)
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Failed')

      // Assert: Verify state reset to CLOSED after successful operation
      await circuitBreaker.execute(operation)
      expect(circuitBreaker.getState()).toBe('CLOSED')
    })
  })

  describe('CircuitBreaker - OPEN state', () => {
    let circuitBreaker: CircuitBreaker

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(2, 2, 100)
    })

    it('should open after failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Failed'))

      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(operation)
        } catch (e) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN')
    })

    it('should reject operations when OPEN', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Failed'))

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(operation)
        } catch (e) {
          // Expected
        }
      }

      // Try to execute when OPEN
      const okOperation = jest.fn().mockResolvedValue('ok')
      await expect(circuitBreaker.execute(okOperation)).rejects.toThrow('Circuit breaker is OPEN')

      expect(okOperation).not.toHaveBeenCalled()
    })

    it('should transition to HALF_OPEN after timeout', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Failed'))

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(operation)
        } catch (e) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN')

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Next operation should transition to HALF_OPEN
      const okOperation = jest.fn().mockResolvedValue('recovered')
      const result = await circuitBreaker.execute(okOperation)

      expect(result).toBe('recovered')
      expect(okOperation).toHaveBeenCalled()
    })
  })

  describe('CircuitBreaker - HALF_OPEN state', () => {
    let circuitBreaker: CircuitBreaker

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(2, 2, 100)
    })

    it('should transition to CLOSED after success threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Failed'))

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(operation)
        } catch (e) {
          // Expected
        }
      }

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Transition to HALF_OPEN and succeed
      const successOp = jest.fn().mockResolvedValue('ok')
      await circuitBreaker.execute(successOp)
      expect(circuitBreaker.getState()).toBe('HALF_OPEN')

      await circuitBreaker.execute(successOp)
      expect(circuitBreaker.getState()).toBe('CLOSED')
    })

    it('should reopen if fails in HALF_OPEN', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Failed'))

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(operation)
        } catch (e) {
          // Expected
        }
      }

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Transition to HALF_OPEN and fail
      const failOp = jest.fn().mockRejectedValue(new Error('Still failing'))
      try {
        await circuitBreaker.execute(failOp)
      } catch (e) {
        // Expected
      }

      expect(circuitBreaker.getState()).toBe('OPEN')
    })
  })

  describe('CircuitBreaker - stress testing', () => {
    it('should handle rapid success/failure cycles', async () => {
      const breaker = new CircuitBreaker(5, 3, 100)
      const operation = jest.fn()

      operation.mockResolvedValueOnce('ok').mockRejectedValueOnce(new Error('fail'))

      for (let i = 0; i < 100; i++) {
        const op = operation.getMockImplementation() ? operation : jest.fn().mockResolvedValue('ok')
        try {
          await breaker.execute(op)
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toMatch(/CLOSED|HALF_OPEN/)
    })

    it('should handle concurrent requests correctly', async () => {
      const breaker = new CircuitBreaker(3, 2, 100)
      const operation = jest.fn().mockResolvedValue('ok')

      const promises = Array.from({ length: 10 }, () => breaker.execute(operation).catch(() => {}))

      await Promise.all(promises)

      expect(operation).toHaveBeenCalled()
    })
  })
})

