/**
 * Rate Limiting Configuration
 * Per-endpoint rate limits with tier-based strategy
 *
 * Strategy:
 * - Public endpoints: IP-based limiting (less strict)
 * - Authenticated endpoints: User-ID based limiting (stricter)
 * - Admin endpoints: Admin ID based limiting
 */

import type { RateLimitConfig } from './rate-limiter'

export interface EndpointRateLimitSpec {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
  tier: 'public' | 'authenticated' | 'admin'
  description: string
}

// Detailed per-endpoint configuration
export const ENDPOINT_LIMITS: Record<string, EndpointRateLimitSpec> = {
  // Authentication endpoints - CRITICAL: prevent brute force attacks
  '/api/auth': {
    windowMs: 15 * 60 * 1000, // 15 minute window
    maxRequests: 5, // 5 attempts per 15 minutes
    tier: 'public',
    description: 'Token generation - prevent brute force',
  },
  '/api/auth/login': {
    windowMs: 15 * 60 * 1000, // 15 minute window
    maxRequests: 5, // 5 login attempts per 15 minutes
    tier: 'public',
    description: 'Login endpoint - prevent brute force',
  },
  '/api/auth/verify': {
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 30, // 30 verifications per minute
    tier: 'public',
    description: 'Token verification - frequent calls allowed',
  },

  // Health/monitoring endpoints - PERMISSIVE for monitoring
  '/api/health': {
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 120, // 120 checks per minute (2 per second)
    tier: 'public',
    description: 'Health checks - monitoring systems',
  },

  // Data endpoints - MODERATE limits
  '/api/metrics': {
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 30, // 30 requests per minute
    tier: 'authenticated',
    description: 'Metrics collection',
  },
  '/api/alerts': {
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 20, // 20 requests per minute
    tier: 'authenticated',
    description: 'Alert management',
  },
  '/api/profiles': {
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 30, // 30 requests per minute
    tier: 'authenticated',
    description: 'Profile operations',
  },

  // Complex processing endpoints - STRICT limits
  '/api/meetings': {
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 10, // 10 requests per minute
    tier: 'authenticated',
    description: 'Meeting API - expensive file operations',
  },
  '/api/kanban': {
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 20, // 20 requests per minute
    tier: 'authenticated',
    description: 'Kanban board operations',
  },
  '/api/conductor': {
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 15, // 15 requests per minute
    tier: 'authenticated',
    description: 'Conductor orchestration API',
  },
  '/api/brain': {
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 10, // 10 requests per minute
    tier: 'authenticated',
    description: 'Brain AI operations',
  },
}

// Legacy token bucket configs (for backwards compatibility with rate-limiter.ts)
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Authentication endpoints - STRICT limits to prevent brute force
  auth: {
    maxTokens: 5,
    refillRate: 0.1, // 1 token per 10 seconds = 6 per minute
    windowMs: 60000, // 1 minute window
    keyPrefix: 'rl:auth',
  },

  // Health check - PERMISSIVE
  health: {
    maxTokens: 1000,
    refillRate: 100, // 100 per second
    windowMs: 60000,
    keyPrefix: 'rl:health',
  },

  // Standard API endpoints - MODERATE
  api: {
    maxTokens: 100,
    refillRate: 10, // 10 per second = 600 per minute
    windowMs: 60000,
    keyPrefix: 'rl:api',
  },

  // Data-heavy endpoints (metrics, reports) - MODERATE
  data: {
    maxTokens: 50,
    refillRate: 5, // 5 per second = 300 per minute
    windowMs: 60000,
    keyPrefix: 'rl:data',
  },

  // User profile/account endpoints - STRICT
  account: {
    maxTokens: 30,
    refillRate: 2, // 2 per second = 120 per minute
    windowMs: 60000,
    keyPrefix: 'rl:account',
  },

  // Kanban/project endpoints - MODERATE
  projects: {
    maxTokens: 60,
    refillRate: 5, // 5 per second = 300 per minute
    windowMs: 60000,
    keyPrefix: 'rl:projects',
  },
}

/**
 * Map endpoint paths to their rate limit config
 */
export function getEndpointConfig(pathname: string): RateLimitConfig {
  if (pathname.startsWith('/api/auth/')) {
    return RATE_LIMIT_CONFIGS.auth
  }

  if (pathname.startsWith('/api/health')) {
    return RATE_LIMIT_CONFIGS.health
  }

  if (pathname.startsWith('/api/metrics') || pathname.startsWith('/api/alerts')) {
    return RATE_LIMIT_CONFIGS.data
  }

  if (pathname.startsWith('/api/profiles')) {
    return RATE_LIMIT_CONFIGS.account
  }

  if (pathname.startsWith('/api/kanban')) {
    return RATE_LIMIT_CONFIGS.projects
  }

  // Default to standard API limits
  return RATE_LIMIT_CONFIGS.api
}

/**
 * Get identifier key for rate limiting
 * Uses user ID if authenticated, otherwise IP address
 */
export function getRateLimitKey(
  pathname: string,
  request: Request,
  userId?: string
): string {
  const config = getEndpointConfig(pathname)

  if (userId) {
    // Authenticated endpoint - use user ID
    return `${config.keyPrefix}:user:${userId}`
  }

  // Extract IP address from request
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown'

  return `${config.keyPrefix}:ip:${ip}`
}

/**
 * Error response for rate limit exceeded
 */
export function createRateLimitErrorResponse(remaining: number): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Too many requests. Please try again later.',
      statusCode: 429,
      retryAfter: 60,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60',
        'X-RateLimit-Remaining': remaining.toString(),
      },
    }
  )
}

/**
 * Success headers to include in response
 */
export function createRateLimitHeaders(remaining: number): Record<string, string> {
  return {
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Limit': '100',
  }
}
