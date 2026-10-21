/**
 * Auth Configuration
 * Centralized configuration for auth routes and protected endpoints
 */

export interface RouteConfig {
  requireAuth: boolean
  allowedRoles?: string[]
  rateLimit?: boolean
  public?: boolean
}

/**
 * Route configuration mapping
 * Define which routes require authentication and what roles are allowed
 */
export const ROUTE_CONFIG: Record<string, RouteConfig> = {
  // Auth routes - public, no auth required
  '/api/auth/login': { requireAuth: false, public: true, rateLimit: true },
  '/api/auth/verify': { requireAuth: false, public: true, rateLimit: true },
  '/api/auth/refresh': { requireAuth: false, public: true, rateLimit: true },
  '/api/auth': { requireAuth: false, public: true, rateLimit: true },

  // Health check - public, no auth required (for monitoring)
  '/api/health': { requireAuth: false, public: true, rateLimit: false },

  // Protected endpoints - require authentication
  '/api/alerts': { requireAuth: true, rateLimit: true },
  '/api/brain': { requireAuth: true, rateLimit: true },
  '/api/conductor': { requireAuth: true, rateLimit: true },
  '/api/kanban': { requireAuth: true, rateLimit: true },
  '/api/meetings': { requireAuth: true, rateLimit: true },
  '/api/metrics': { requireAuth: true, rateLimit: true },
  '/api/profiles': { requireAuth: true, rateLimit: true },
  '/api/audit': { requireAuth: true, allowedRoles: ['admin'], rateLimit: true },
  '/api/admin': { requireAuth: true, allowedRoles: ['admin'], rateLimit: true },
}

/**
 * Get route configuration
 * Returns default protected config if route not explicitly defined
 */
export function getRouteConfig(pathname: string): RouteConfig {
  // Check exact match first
  if (pathname in ROUTE_CONFIG) {
    return ROUTE_CONFIG[pathname]
  }

  // Check prefix matches
  for (const [route, config] of Object.entries(ROUTE_CONFIG)) {
    if (pathname.startsWith(route)) {
      return config
    }
  }

  // Default: all API routes require auth unless explicitly public
  if (pathname.startsWith('/api/')) {
    return { requireAuth: true, rateLimit: true }
  }

  // Non-API routes don't need auth
  return { requireAuth: false, public: false, rateLimit: false }
}

/**
 * Check if route is public
 */
export function isPublicRoute(pathname: string): boolean {
  const config = getRouteConfig(pathname)
  return config.public === true
}

/**
 * Check if route requires authentication
 */
export function isProtectedRoute(pathname: string): boolean {
  const config = getRouteConfig(pathname)
  return config.requireAuth === true
}

/**
 * Check if route has specific role requirements
 */
export function getRequiredRoles(pathname: string): string[] {
  const config = getRouteConfig(pathname)
  return config.allowedRoles || []
}
