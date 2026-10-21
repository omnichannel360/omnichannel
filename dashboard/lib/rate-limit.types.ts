/**
 * Rate limiting types and interfaces
 */

export type RateLimitTier = 'public' | 'authenticated' | 'premium'

export interface RateLimitConfig {
  requestsPerWindow: number
  windowMs: number
  tier: RateLimitTier
  keyPrefix: string
}

export interface RateLimitRecord {
  count: number
  resetTime: number
  createdAt: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

export interface RateLimitStore {
  increment(key: string): Promise<RateLimitRecord>
  get(key: string): Promise<RateLimitRecord | null>
  reset(key: string): Promise<void>
  cleanup(): Promise<void>
}

export interface ClientInfo {
  ip: string
  userId?: string
  apiKey?: string
}
