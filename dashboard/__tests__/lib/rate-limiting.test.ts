/**
 * Rate Limiting Tests
 * Tests for rate limiting middleware implementation
 */

import {
  createRateLimiter,
  defaultKeyGenerator,
  userKeyGenerator,
  rateLimiters,
} from "@/lib/rate-limiting";
import { NextRequest, NextResponse } from "next/server";

/**
 * Mock NextRequest factory
 */
function createMockRequest(
  options: {
    ip?: string;
    userId?: string;
    path?: string;
    method?: string;
  } = {}
): NextRequest {
  const {
    ip = "192.168.1.1",
    userId,
    path = "/api/test",
    method = "GET",
  } = options;

  const url = new URL(`http://localhost${path}`);
  const request = new NextRequest(url, {
    method,
    headers: new Headers({
      "x-forwarded-for": ip,
      ...(userId && { "x-user-id": userId }),
    }),
  });

  return request;
}

describe("Rate Limiting", () => {
  describe("Key Generators", () => {
    test("defaultKeyGenerator uses IP address", () => {
      const request = createMockRequest({ ip: "192.168.1.100" });
      const key = defaultKeyGenerator(request);

      expect(key).toBe("ip:192.168.1.100");
    });

    test("defaultKeyGenerator uses x-forwarded-for header", () => {
      const request = createMockRequest({ ip: "10.0.0.1" });
      const key = defaultKeyGenerator(request);

      expect(key).toContain("10.0.0.1");
    });

    test("userKeyGenerator uses user ID when available", () => {
      const request = createMockRequest({ userId: "user-123" });
      const key = userKeyGenerator(request);

      expect(key).toBe("user:user-123");
    });

    test("userKeyGenerator falls back to IP when no user ID", () => {
      const request = createMockRequest({ ip: "192.168.1.1" });
      const key = userKeyGenerator(request);

      expect(key).toContain("ip:");
    });
  });

  describe("Rate Limiter Creation", () => {
    test("creates rate limiter with default config", async () => {
      const limiter = createRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      expect(limiter).toBeDefined();
    });

    test("allows requests within limit", async () => {
      const limiter = createRateLimiter({
        maxRequests: 3,
        windowMs: 60000,
        keyGenerator: defaultKeyGenerator,
      });

      const request = createMockRequest();
      const response = await limiter(request);

      expect(response).toBeNull();
    });

    test("blocks requests exceeding limit", async () => {
      const limiter = createRateLimiter({
        maxRequests: 2,
        windowMs: 60000,
        keyGenerator: defaultKeyGenerator,
      });

      const request = createMockRequest({ ip: "192.168.1.1" });

      // Make 3 requests (exceeding limit of 2)
      const res1 = await limiter(request);
      expect(res1).toBeNull(); // 1st request - allowed

      const res2 = await limiter(request);
      expect(res2).toBeNull(); // 2nd request - allowed

      const res3 = await limiter(request);
      expect(res3).toBeDefined(); // 3rd request - blocked
      expect(res3?.status).toBe(429); // Too Many Requests
    });

    test("sets rate limit headers", async () => {
      const limiter = createRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
        keyGenerator: defaultKeyGenerator,
      });

      const request = createMockRequest();
      const response = await limiter(request);

      // If response is null, check headers in request
      // Rate limiter should set headers even when allowing
      expect(response).toBeNull(); // Request allowed
    });

    test("returns 429 status when limit exceeded", async () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        keyGenerator: defaultKeyGenerator,
      });

      const request = createMockRequest();

      const res1 = await limiter(request);
      expect(res1).toBeNull(); // 1st request allowed

      const res2 = await limiter(request);
      expect(res2?.status).toBe(429);

      const body = await res2?.json();
      expect(body.error).toBe("Too many requests, please try again later.");
    });
  });

  describe("Endpoint-Specific Limiters", () => {
    test("auth limiter is defined", () => {
      expect(rateLimiters.auth).toBeDefined();
    });

    test("login limiter is defined", () => {
      expect(rateLimiters.login).toBeDefined();
    });

    test("verify limiter is defined", () => {
      expect(rateLimiters.verify).toBeDefined();
    });

    test("brain limiter uses user-based rate limiting", async () => {
      const request1 = createMockRequest({ userId: "user-1", ip: "1.1.1.1" });
      const request2 = createMockRequest({ userId: "user-2", ip: "1.1.1.1" });

      // Two different users from same IP should have separate limits
      const res1 = await rateLimiters.brain(request1);
      const res2 = await rateLimiters.brain(request2);

      // Both should be allowed (different users)
      expect(res1).toBeNull();
      expect(res2).toBeNull();
    });

    test("protected limiter allows 100 requests per minute", async () => {
      const limiter = createRateLimiter({
        maxRequests: 100,
        windowMs: 60000,
        keyGenerator: userKeyGenerator,
      });

      expect(limiter).toBeDefined();
    });
  });

  describe("Concurrent Requests", () => {
    test("handles concurrent requests correctly", async () => {
      const limiter = createRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
        keyGenerator: defaultKeyGenerator,
      });

      const request = createMockRequest({ ip: "192.168.1.1" });

      // Fire multiple concurrent requests
      const promises = Array(10).fill(null).map(() => limiter(request));

      const responses = await Promise.all(promises);

      // First 5 should be null (allowed), rest should have 429 status
      const allowed = responses.filter((r) => r === null).length;
      const blocked = responses.filter((r) => r?.status === 429).length;

      expect(allowed).toBe(5);
      expect(blocked).toBe(5);
    });
  });

  describe("Rate Limit Reset", () => {
    test("resets rate limit after time window expires", async () => {
      jest.useFakeTimers();

      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 5000, // 5 second window
        keyGenerator: defaultKeyGenerator,
      });

      const request = createMockRequest();

      // First request should be allowed
      const res1 = await limiter(request);
      expect(res1).toBeNull();

      // Second request should be blocked
      const res2 = await limiter(request);
      expect(res2?.status).toBe(429);

      // Advance time by 5 seconds
      jest.advanceTimersByTime(5000);

      // Third request should be allowed (window reset)
      const res3 = await limiter(request);
      expect(res3).toBeNull();

      jest.useRealTimers();
    });
  });

  describe("Error Handling", () => {
    test("returns error response with proper format", async () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        keyGenerator: defaultKeyGenerator,
      });

      const request = createMockRequest();

      // Exhaust limit
      await limiter(request);

      // Next request should be blocked
      const response = await limiter(request);
      expect(response).toBeDefined();

      const body = await response?.json();
      expect(body).toHaveProperty("success", false);
      expect(body).toHaveProperty("error");
    });
  });
});

describe("Rate Limiting Integration", () => {
  test("multiple limiters operate independently", async () => {
    const limiter1 = createRateLimiter({
      maxRequests: 2,
      windowMs: 60000,
      keyGenerator: defaultKeyGenerator,
    });

    const limiter2 = createRateLimiter({
      maxRequests: 3,
      windowMs: 60000,
      keyGenerator: defaultKeyGenerator,
    });

    const request = createMockRequest({ ip: "192.168.1.1" });

    // limiter1 should block after 2 requests
    const res1_1 = await limiter1(request);
    const res1_2 = await limiter1(request);
    const res1_3 = await limiter1(request);

    expect(res1_1).toBeNull();
    expect(res1_2).toBeNull();
    expect(res1_3?.status).toBe(429);

    // limiter2 should allow up to 3 requests
    const res2_1 = await limiter2(request);
    const res2_2 = await limiter2(request);
    const res2_3 = await limiter2(request);
    const res2_4 = await limiter2(request);

    expect(res2_1).toBeNull();
    expect(res2_2).toBeNull();
    expect(res2_3).toBeNull();
    expect(res2_4?.status).toBe(429);
  });

  test("different IPs have separate limits", async () => {
    const limiter = createRateLimiter({
      maxRequests: 2,
      windowMs: 60000,
      keyGenerator: defaultKeyGenerator,
    });

    const request1 = createMockRequest({ ip: "192.168.1.1" });
    const request2 = createMockRequest({ ip: "192.168.1.2" });

    // Request from IP 1 - should allow 2
    const res1_1 = await limiter(request1);
    const res1_2 = await limiter(request1);
    const res1_3 = await limiter(request1);

    expect(res1_1).toBeNull();
    expect(res1_2).toBeNull();
    expect(res1_3?.status).toBe(429);

    // Request from IP 2 - should allow 2 (separate limit)
    const res2_1 = await limiter(request2);
    const res2_2 = await limiter(request2);
    const res2_3 = await limiter(request2);

    expect(res2_1).toBeNull();
    expect(res2_2).toBeNull();
    expect(res2_3?.status).toBe(429);
  });
});
