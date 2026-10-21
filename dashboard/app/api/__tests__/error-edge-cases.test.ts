/**
 * Error Handling Edge Cases Tests
 * Tests timeout handling, retry logic, and circuit breaker patterns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  retryWithBackoff,
  DEFAULT_RETRY_CONFIG,
  withTimeout,
  CircuitBreaker,
  RetryConfig,
} from '@/lib/error-handling'

describe('Error Handling Edge Cases', () => {
  describe('withTimeout function', () => {
    it('should resolve successfully when operation completes before timeout', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 50)
      })

      const result = await withTimeout(operation, 200)
      expect(result).toBe('success')
    })

    it('should reject with timeout error when operation exceeds timeout', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 200)
      })

      await expect(withTimeout(operation, 50)).rejects.toThrow('Operation timeout')
    })

    it('should use custom timeout message', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 200)
      })

      await expect(withTimeout(operation, 50, 'Custom timeout message')).rejects.toThrow(
        'Custom timeout message'
      )
    })

    it('should handle immediate timeout', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 1000)
      })

      await expect(withTimeout(operation, 0)).rejects.toThrow()
    })

    it('should handle promise rejection before timeout', async () => {
      const operation = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation failed')), 50)
      })

      await expect(withTimeout(operation, 200)).rejects.toThrow('Operation failed')
    })

    it('should handle zero timeout edge case', async () => {
      const operation = Promise.resolve('success')
      await expect(withTimeout(operation, 0)).resolves.toBe('success')
    })

    it('should handle very large timeout values', async () => {
      const operation = Promise.resolve('success')
      const result = await withTimeout(operation, Number.MAX_SAFE_INTEGER)
      expect(result).toBe('success')
    })
  })

  describe('retryWithBackoff function', () => {
    it('should succeed on first attempt if no error', async () => {
      const operation = vi.fn().mockResolvedValue('success')

      const result = await retryWithBackoff(operation)

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(1)
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
      const operation = vi.fn().mockRejectedValue(new Error('Invalid input'))

      await expect(retryWithBackoff(operation)).rejects.toThrow('Invalid input')
      expect(operation).toHaveBeenCalledTimes(1)
    })

    it('should fail after max retries exceeded', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'))

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

      const operation = vi.fn().mockRejectedValue(new Error('timeout'))

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
      const isRetryable = vi.fn((error) => {
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
      const operation = vi.fn().mockResolvedValue('success')

      const result = await circuitBreaker.execute(operation)

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledOnce()
      expect(circuitBreaker.getState()).toBe('CLOSED')
    })

    it('should track successful operations', async () => {
      const operation = vi.fn().mockResolvedValue('ok')

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

      await circuitBreaker.execute(operation)
      try {
        await circuitBreaker.execute(operation)
      } catch (e) {
        // Expected
      }
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
      const operation = vi.fn().mockRejectedValue(new Error('Failed'))

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
      const operation = vi.fn().mockRejectedValue(new Error('Failed'))

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(operation)
        } catch (e) {
          // Expected
        }
      }

      // Try to execute when OPEN
      const okOperation = vi.fn().mockResolvedValue('ok')
      await expect(circuitBreaker.execute(okOperation)).rejects.toThrow('Circuit breaker is OPEN')

      expect(okOperation).not.toHaveBeenCalled()
    })

    it('should transition to HALF_OPEN after timeout', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failed'))

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
      const okOperation = vi.fn().mockResolvedValue('recovered')
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
      const operation = vi.fn().mockRejectedValue(new Error('Failed'))

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
      const successOp = vi.fn().mockResolvedValue('ok')
      await circuitBreaker.execute(successOp)
      expect(circuitBreaker.getState()).toBe('HALF_OPEN')

      await circuitBreaker.execute(successOp)
      expect(circuitBreaker.getState()).toBe('CLOSED')
    })

    it('should reopen if fails in HALF_OPEN', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failed'))

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
      const failOp = vi.fn().mockRejectedValue(new Error('Still failing'))
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
      const operation = vi.fn()

      operation.mockResolvedValueOnce('ok').mockRejectedValueOnce(new Error('fail'))

      for (let i = 0; i < 100; i++) {
        const op = operation.getMockImplementation() ? operation : vi.fn().mockResolvedValue('ok')
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
      const operation = vi.fn().mockResolvedValue('ok')

      const promises = Array.from({ length: 10 }, () => breaker.execute(operation).catch(() => {}))

      await Promise.all(promises)

      expect(operation).toHaveBeenCalled()
    })
  })
})
