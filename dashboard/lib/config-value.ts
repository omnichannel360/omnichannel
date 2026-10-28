import { createLogger } from '@/lib/logger'

const logger = createLogger('metrics-api')

/**
 * Get configuration value from environment with safe defaults and validation.
 * Handles env var parsing with NaN detection and error logging.
 * Lives outside the route module because Next.js route files may only export
 * route handlers and config.
 */
export const getConfigValue = (envKey: string, defaultValue: number): number => {
  const value = process.env[envKey]
  if (!value) return defaultValue

  const parsed = parseInt(value, 10)
  // Validate that parseInt succeeded (returns NaN on failure)
  if (isNaN(parsed)) {
    logger.warn(`Invalid numeric value for ${envKey}: "${value}", using default: ${defaultValue}`, {
      envKey,
      invalidValue: value,
      defaultValue,
    })
    return defaultValue
  }

  return parsed
}
