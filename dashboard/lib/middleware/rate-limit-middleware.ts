/**
 * Rate Limiting Middleware Wrapper
 * Higher-order function to apply rate limiting to API routes
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createRateLimiter,
  rateLimiters,
  type RateLimitConfig,
} from "@/lib/rate-limiting";

type RouteHandler = (
  request: NextRequest
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps an API route handler with rate limiting
 */
export function withRateLimit(
  handler: RouteHandler,
  limiterConfig?: RateLimitConfig | keyof typeof rateLimiters
): RouteHandler {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // Get the appropriate limiter
      let limiter: (req: NextRequest) => Promise<NextResponse | null>;

      if (typeof limiterConfig === "string") {
        // Use predefined limiter by name
        limiter = rateLimiters[limiterConfig as keyof typeof rateLimiters];
      } else if (limiterConfig) {
        // Create custom limiter
        limiter = createRateLimiter(limiterConfig);
      } else {
        // Default to protected limiter
        limiter = rateLimiters.protected;
      }

      // Check rate limit
      const rateLimitResponse = await limiter(request);

      if (rateLimitResponse) {
        // Rate limit exceeded
        return rateLimitResponse;
      }

      // Rate limit passed, call handler
      return await handler(request);
    } catch (error) {
      console.error("Rate limit middleware error:", error);
      // If rate limiting fails, continue to handler (fail open)
      return await handler(request);
    }
  };
}

/**
 * Wraps multiple HTTP methods with rate limiting
 */
export function withRateLimitMethods(
  handlers: Record<string, RouteHandler>,
  limiterConfig?: RateLimitConfig | keyof typeof rateLimiters
): Record<string, RouteHandler> {
  const wrapped: Record<string, RouteHandler> = {};

  for (const [method, handler] of Object.entries(handlers)) {
    wrapped[method] = withRateLimit(handler, limiterConfig);
  }

  return wrapped;
}

/**
 * Export both wrapped and unwrapped handlers
 */
export function createRoute(
  handlers: Record<string, RouteHandler>,
  limiterConfig?: RateLimitConfig | keyof typeof rateLimiters
): Record<string, RouteHandler> {
  return withRateLimitMethods(handlers, limiterConfig);
}
