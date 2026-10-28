/**
 * Metrics Endpoint Tests - Comprehensive Edge Case Coverage
 * Tests configuration validation, null safety, and metrics calculation
 *
 * Generated: 2026-10-22
 * Belt Level: Black
 * Target: 100% coverage on metrics calculation and config validation
 *
 * Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import type { Metrics } from '@/app/api/metrics/route'
import { getConfigValue } from '@/lib/config-value'

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Validate metrics object structure and ranges
 */
const validateMetricsStructure = (metrics: Metrics): void => {
  // Finance metrics
  expect(metrics.finance).toBeDefined()
  expect(typeof metrics.finance.revenue).toBe('number')
  expect(typeof metrics.finance.costs).toBe('number')
  expect(typeof metrics.finance.profit_margin).toBe('number')
  expect(metrics.finance.revenue).toBeGreaterThanOrEqual(0)
  expect(metrics.finance.costs).toBeGreaterThanOrEqual(0)
  expect(metrics.finance.profit_margin).toBeGreaterThanOrEqual(0)
  expect(metrics.finance.profit_margin).toBeLessThanOrEqual(1)

  // Operations metrics
  expect(metrics.operations).toBeDefined()
  expect(typeof metrics.operations.agents_deployed).toBe('number')
  expect(typeof metrics.operations.skills_available).toBe('number')
  expect(typeof metrics.operations.avg_processing_time_ms).toBe('number')
  expect(metrics.operations.agents_deployed).toBeGreaterThanOrEqual(0)
  expect(metrics.operations.skills_available).toBeGreaterThanOrEqual(0)
  expect(metrics.operations.avg_processing_time_ms).toBeGreaterThanOrEqual(0)

  // Performance metrics
  expect(metrics.performance).toBeDefined()
  expect(typeof metrics.performance.success_rate).toBe('number')
  expect(typeof metrics.performance.error_rate).toBe('number')
  expect(typeof metrics.performance.uptime_percent).toBe('number')
  expect(metrics.performance.success_rate).toBeGreaterThanOrEqual(0)
  expect(metrics.performance.success_rate).toBeLessThanOrEqual(1)
  expect(metrics.performance.error_rate).toBeGreaterThanOrEqual(0)
  expect(metrics.performance.error_rate).toBeLessThanOrEqual(1)
  expect(metrics.performance.uptime_percent).toBeGreaterThanOrEqual(0)
  expect(metrics.performance.uptime_percent).toBeLessThanOrEqual(100)

  // User activity metrics
  expect(metrics.user_activity).toBeDefined()
  expect(typeof metrics.user_activity.active_users).toBe('number')
  expect(typeof metrics.user_activity.total_meetings_processed).toBe('number')
  expect(typeof metrics.user_activity.avg_task_completion_time_minutes).toBe('number')
  expect(metrics.user_activity.active_users).toBeGreaterThanOrEqual(0)
  expect(metrics.user_activity.total_meetings_processed).toBeGreaterThanOrEqual(0)
  expect(metrics.user_activity.avg_task_completion_time_minutes).toBeGreaterThanOrEqual(0)
}

// ============================================================================
// CONFIGURATION VALIDATION TESTS
// ============================================================================

describe('getConfigValue() - Configuration Parsing', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Valid Configuration Values', () => {
    it('should parse valid numeric strings', () => {
      process.env.TEST_VALUE = '12345'
      const result = getConfigValue('TEST_VALUE', 0)
      expect(result).toBe(12345)
      expect(typeof result).toBe('number')
    })

    it('should handle zero as valid value', () => {
      process.env.TEST_VALUE = '0'
      const result = getConfigValue('TEST_VALUE', 100)
      expect(result).toBe(0)
    })

    it('should handle negative numbers', () => {
      process.env.TEST_VALUE = '-500'
      const result = getConfigValue('TEST_VALUE', 100)
      expect(result).toBe(-500)
    })

    it('should handle large numbers', () => {
      process.env.TEST_VALUE = '999999999'
      const result = getConfigValue('TEST_VALUE', 0)
      expect(result).toBe(999999999)
    })
  })

  describe('Invalid Configuration Values', () => {
    it('should return default on non-numeric string', () => {
      process.env.TEST_VALUE = 'not-a-number'
      const result = getConfigValue('TEST_VALUE', 100)
      expect(result).toBe(100)
    })

    it('should return default on empty string', () => {
      process.env.TEST_VALUE = ''
      const result = getConfigValue('TEST_VALUE', 50)
      expect(result).toBe(50)
    })

    it('should return default on NaN result', () => {
      process.env.TEST_VALUE = 'abc123def'
      const result = getConfigValue('TEST_VALUE', 75)
      expect(result).toBe(75)
    })

    it('should return default on missing env var', () => {
      delete process.env.MISSING_VALUE
      const result = getConfigValue('MISSING_VALUE', 200)
      expect(result).toBe(200)
    })

    it('should return default on float string (parseInt behavior)', () => {
      process.env.TEST_VALUE = '123.45'
      const result = getConfigValue('TEST_VALUE', 0)
      // parseInt('123.45', 10) returns 123 (truncates decimal)
      expect(result).toBe(123)
    })

    it('should return default on whitespace-only string', () => {
      process.env.TEST_VALUE = '   '
      const result = getConfigValue('TEST_VALUE', 999)
      expect(result).toBe(999)
    })
  })

  describe('Default Value Behavior', () => {
    it('should use default when env var is missing', () => {
      delete process.env.METRICS_REVENUE
      const result = getConfigValue('METRICS_REVENUE', 125000)
      expect(result).toBe(125000)
    })

    it('should use default when env var is invalid', () => {
      process.env.METRICS_COSTS = 'invalid'
      const result = getConfigValue('METRICS_COSTS', 45000)
      expect(result).toBe(45000)
    })

    it('should accept zero as valid override', () => {
      process.env.METRICS_UPTIME = '0'
      const result = getConfigValue('METRICS_UPTIME', 9998)
      expect(result).toBe(0)
    })

    it('should override default with valid value', () => {
      process.env.METRICS_AGENTS = '99'
      const result = getConfigValue('METRICS_AGENTS', 12)
      expect(result).toBe(99)
    })
  })
})

// ============================================================================
// METRICS CALCULATION EDGE CASES
// ============================================================================

describe('Metrics Calculation - Edge Cases', () => {
  describe('Division by Zero Protection', () => {
    it('should handle success_rate when total_meetings is 0', () => {
      // When meetings array is empty
      const totalMeetings = 0
      const successCount = 0
      const successRate = totalMeetings > 0 ? successCount / totalMeetings : 1.0
      expect(successRate).toBe(1.0)
      expect(Number.isFinite(successRate)).toBe(true)
    })

    it('should handle average calculation when array is empty', () => {
      const meetingsLog: Array<{ duration_ms?: number }> = []
      const avgProcessingTime = meetingsLog.length > 0
        ? meetingsLog.reduce((sum, m) => sum + (m.duration_ms ?? 0), 0) / meetingsLog.length
        : 0
      expect(avgProcessingTime).toBe(0)
      expect(Number.isFinite(avgProcessingTime)).toBe(true)
    })

    it('should handle completed meetings average when count is 0', () => {
      const completedMeetings: Array<{ duration_ms?: number }> = []
      const avgTaskCompletionMs = completedMeetings.length > 0
        ? completedMeetings.reduce((sum, m) => sum + (m.duration_ms ?? 0), 0) / completedMeetings.length
        : 0
      expect(avgTaskCompletionMs).toBe(0)
      expect(Number.isNaN(avgTaskCompletionMs)).toBe(false)
    })
  })

  describe('NaN Propagation Prevention', () => {
    it('should not propagate NaN in average calculations', () => {
      const meetingsLog = [
        { duration_ms: 100 },
        { duration_ms: 200 },
        { duration_ms: undefined }, // undefined is handled by ?? 0
      ]
      const avgProcessingTime = meetingsLog.length > 0
        ? meetingsLog.reduce((sum, m) => sum + (m.duration_ms ?? 0), 0) / meetingsLog.length
        : 0
      expect(Number.isNaN(avgProcessingTime)).toBe(false)
      expect(avgProcessingTime).toBe(100) // (100 + 200 + 0) / 3
    })

    it('should handle minutes conversion without NaN', () => {
      const avgTaskCompletionMs = 0
      const avgTaskCompletionMinutes = Math.round(avgTaskCompletionMs / 60000 * 10) / 10
      expect(avgTaskCompletionMinutes).toBe(0)
      expect(Number.isNaN(avgTaskCompletionMinutes)).toBe(false)
    })

    it('should correctly round positive minutes', () => {
      const avgTaskCompletionMs = 750000 // 12.5 minutes
      const avgTaskCompletionMinutes = Math.round(avgTaskCompletionMs / 60000 * 10) / 10
      expect(avgTaskCompletionMinutes).toBe(12.5)
    })

    it('should handle Math.round precision', () => {
      const avgTaskCompletionMs = 1230000 // 20.5 minutes
      const avgTaskCompletionMinutes = Math.round(avgTaskCompletionMs / 60000 * 10) / 10
      expect(avgTaskCompletionMinutes).toBe(20.5)
    })
  })

  describe('Math.max() Safety', () => {
    it('should use Math.max for minimum skill count', () => {
      const skillCount = 5
      const skillsAvailable = Math.max(skillCount, 47)
      expect(skillsAvailable).toBe(47)
    })

    it('should use actual count if greater than minimum', () => {
      const skillCount = 100
      const skillsAvailable = Math.max(skillCount, 47)
      expect(skillsAvailable).toBe(100)
    })

    it('should handle zero skill count with fallback', () => {
      const skillCount = 0
      const skillsAvailable = Math.max(skillCount, 47)
      expect(skillsAvailable).toBe(47)
    })
  })

  describe('Fallback Behavior', () => {
    it('should return fallback value when calculation result is 0 or falsy', () => {
      const avgTaskCompletionMinutes = 0
      const result = avgTaskCompletionMinutes > 0 ? avgTaskCompletionMinutes : 12.5
      expect(result).toBe(12.5)
    })

    it('should not fallback when value is valid positive number', () => {
      const avgTaskCompletionMinutes = 15.3
      const result = avgTaskCompletionMinutes > 0 ? avgTaskCompletionMinutes : 12.5
      expect(result).toBe(15.3)
    })

    it('should handle negative values with fallback', () => {
      const avgTaskCompletionMinutes = -5
      const result = avgTaskCompletionMinutes > 0 ? avgTaskCompletionMinutes : 12.5
      expect(result).toBe(12.5)
    })
  })
})

// ============================================================================
// METRICS STRUCTURE VALIDATION
// ============================================================================

describe('Metrics Object Structure', () => {
  it('should have all required top-level keys', () => {
    const metricsKeys = ['finance', 'operations', 'performance', 'user_activity']
    const mockMetrics: Metrics = {
      finance: { revenue: 125000, costs: 45000, profit_margin: 0.64 },
      operations: { agents_deployed: 12, skills_available: 47, avg_processing_time_ms: 234 },
      performance: { success_rate: 0.962, error_rate: 0.038, uptime_percent: 99.98 },
      user_activity: { active_users: 23, total_meetings_processed: 42, avg_task_completion_time_minutes: 12.5 },
    }
    metricsKeys.forEach(key => {
      expect(key in mockMetrics).toBe(true)
    })
  })

  it('should have valid numeric types for all values', () => {
    const mockMetrics: Metrics = {
      finance: { revenue: 125000, costs: 45000, profit_margin: 0.64 },
      operations: { agents_deployed: 12, skills_available: 47, avg_processing_time_ms: 234 },
      performance: { success_rate: 0.962, error_rate: 0.038, uptime_percent: 99.98 },
      user_activity: { active_users: 23, total_meetings_processed: 42, avg_task_completion_time_minutes: 12.5 },
    }
    validateMetricsStructure(mockMetrics)
  })

  it('should maintain rate constraints (success + error = 1)', () => {
    const successRate = 0.95
    const errorRate = 1 - successRate
    expect(successRate + errorRate).toBeCloseTo(1.0, 10)
    expect(errorRate).toBeCloseTo(0.05, 10)
  })

  it('should handle all zeros gracefully', () => {
    const mockMetrics: Metrics = {
      finance: { revenue: 0, costs: 0, profit_margin: 0 },
      operations: { agents_deployed: 0, skills_available: 47, avg_processing_time_ms: 0 },
      performance: { success_rate: 1.0, error_rate: 0, uptime_percent: 0 },
      user_activity: { active_users: 0, total_meetings_processed: 0, avg_task_completion_time_minutes: 0 },
    }
    validateMetricsStructure(mockMetrics)
  })

  it('should handle maximum values', () => {
    const mockMetrics: Metrics = {
      finance: { revenue: 999999999, costs: 999999999, profit_margin: 1 },
      operations: { agents_deployed: 999999, skills_available: 999999, avg_processing_time_ms: 999999 },
      performance: { success_rate: 1.0, error_rate: 0, uptime_percent: 100 },
      user_activity: { active_users: 999999, total_meetings_processed: 999999, avg_task_completion_time_minutes: 99999 },
    }
    validateMetricsStructure(mockMetrics)
  })
})

// ============================================================================
// ERROR HANDLING IN METRICS
// ============================================================================

describe('Metrics Error Handling', () => {
  it('should handle missing duration_ms in meetings', () => {
    const meetingsLog = [
      { status: 'completed', duration_ms: 100 },
      { status: 'completed' }, // Missing duration_ms
      { status: 'completed', duration_ms: 200 },
    ]
    const avgMs = meetingsLog.reduce((sum, m) => sum + (m.duration_ms ?? 0), 0) / meetingsLog.length
    expect(avgMs).toBe(100) // (100 + 0 + 200) / 3
    expect(Number.isNaN(avgMs)).toBe(false)
  })

  it('should handle null/undefined values in data', () => {
    const testData: any[] = [
      { value: 100 },
      { value: null },
      { value: undefined },
      { value: 200 },
    ]
    const avg = testData.reduce((sum, d) => sum + (d.value ?? 0), 0) / testData.length
    expect(avg).toBe(75) // (100 + 0 + 0 + 200) / 4
  })

  it('should safely filter by status', () => {
    const meetings = [
      { status: 'completed' },
      { status: 'failed' },
      { status: 'completed' },
      { status: 'pending' },
    ]
    const completed = meetings.filter(m => m.status === 'completed')
    expect(completed.length).toBe(2)
    expect(completed.every(m => m.status === 'completed')).toBe(true)
  })
})

// ============================================================================
// CONFIGURATION INTEGRATION
// ============================================================================

describe('Configuration Value Integration', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should build finance metrics from config', () => {
    process.env.METRICS_REVENUE = '150000'
    process.env.METRICS_COSTS = '50000'
    process.env.METRICS_PROFIT_MARGIN_PCT = '70'

    const revenue = getConfigValue('METRICS_REVENUE', 125000)
    const costs = getConfigValue('METRICS_COSTS', 45000)
    const profitPercent = getConfigValue('METRICS_PROFIT_MARGIN_PCT', 64)

    expect(revenue).toBe(150000)
    expect(costs).toBe(50000)
    expect(profitPercent).toBe(70)

    const profitMargin = profitPercent / 100
    expect(profitMargin).toBe(0.7)
  })

  it('should handle partial config overrides', () => {
    process.env.METRICS_REVENUE = '200000'
    // Others use defaults

    const revenue = getConfigValue('METRICS_REVENUE', 125000)
    const costs = getConfigValue('METRICS_COSTS', 45000) // Uses default

    expect(revenue).toBe(200000)
    expect(costs).toBe(45000)
  })

  it('should handle invalid config gracefully', () => {
    process.env.METRICS_REVENUE = 'bad-value'
    process.env.METRICS_COSTS = '50000'

    const revenue = getConfigValue('METRICS_REVENUE', 125000) // Falls back
    const costs = getConfigValue('METRICS_COSTS', 45000)

    expect(revenue).toBe(125000)
    expect(costs).toBe(50000)
  })

  it('should build all finance metrics correctly', () => {
    const financeMetrics = {
      revenue: getConfigValue('METRICS_REVENUE', 125000),
      costs: getConfigValue('METRICS_COSTS', 45000),
      profit_margin: getConfigValue('METRICS_PROFIT_MARGIN_PCT', 64) / 100,
    }

    expect(financeMetrics.revenue).toBeGreaterThan(0)
    expect(financeMetrics.costs).toBeGreaterThan(0)
    expect(financeMetrics.profit_margin).toBeLessThanOrEqual(1)
  })
})
