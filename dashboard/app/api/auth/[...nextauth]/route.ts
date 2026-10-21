/**
 * NextAuth.js Route Handler
 * Handles all authentication endpoints:
 * - POST /api/auth/signin - Sign in user
 * - GET /api/auth/session - Get current session
 * - GET /api/auth/providers - List available providers
 * - POST /api/auth/callback/jwt - JWT callback
 * - GET /api/auth/error - Authentication error page
 * - POST /api/auth/signout - Sign out user
 *
 * Integrates with existing authentication infrastructure
 */

import { handlers } from '@/auth.config'

export const { GET, POST } = handlers
