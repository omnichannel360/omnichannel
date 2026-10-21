/**
 * NextAuth.js Configuration
 * Provides complete authentication setup with JWT strategy
 * Integrates with existing middleware for API route protection
 */

import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import jwt from 'jsonwebtoken'
import { logger } from './lib/logger'

/**
 * JWT payload type for decoded tokens
 * Ensures type-safe JWT verification without `as any` assertions
 */
interface JWTPayload {
  sub: string
  email: string
  role: 'admin' | 'user' | 'viewer'
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      role: 'admin' | 'user' | 'viewer'
    }
    accessToken: string
    refreshToken?: string
    expiresAt: number
  }

  interface JWT {
    sub: string
    email: string
    role: 'admin' | 'user' | 'viewer'
    accessToken: string
    refreshToken?: string
    expiresAt: number
  }
}

const JWT_SECRET = process.env.JWT_SECRET
const NEXT_AUTH_SECRET = process.env.NEXTAUTH_SECRET

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required')
}

if (!NEXT_AUTH_SECRET) {
  throw new Error('NEXTAUTH_SECRET environment variable is required')
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Session strategy - using JWT for stateless authentication
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
    updateAge: 60 * 60, // Refresh session every hour
  },

  // JWT configuration
  jwt: {
    secret: NEXT_AUTH_SECRET,
    maxAge: 24 * 60 * 60, // 24 hours
  },

  // Pages configuration
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  // Providers - using Credentials for JWT-based auth
  providers: [
    CredentialsProvider({
      id: 'jwt',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        accessToken: { label: 'Access Token', type: 'text' },
        refreshToken: { label: 'Refresh Token', type: 'text' },
      },

      async authorize(credentials) {
        try {
          // If tokens are provided directly (from existing JWT flow)
          if (credentials?.accessToken) {
            const decoded = jwt.verify(credentials.accessToken, JWT_SECRET) as JWTPayload

            return {
              id: decoded.sub,
              email: decoded.email,
              name: decoded.email,
              role: decoded.role || 'user',
              accessToken: credentials.accessToken,
              refreshToken: credentials.refreshToken,
            }
          }

          // Otherwise, validate credentials and generate tokens
          if (!credentials?.email || !credentials?.password) {
            logger.warn('Credentials missing for authentication attempt', {
              component: 'auth.config',
              operation: 'authorize',
            })
            return null
          }

          // TODO: Call your user validation endpoint or database
          // For now, this is a placeholder - replace with actual credential validation
          const user = await validateUserCredentials(credentials.email, credentials.password)

          if (!user) {
            logger.warn('Authentication failed - invalid credentials', {
              component: 'auth.config',
              operation: 'authorize',
              email: credentials.email,
            })
            return null
          }

          // Generate new tokens
          const accessToken = generateAccessToken(user.id, user.email, user.role)
          const refreshToken = generateRefreshToken(user.id, user.email)

          logger.info('User authenticated successfully', {
            component: 'auth.config',
            operation: 'authorize',
            userId: user.id,
            email: user.email,
          })

          return {
            id: user.id,
            email: user.email,
            name: user.email,
            role: user.role || 'user',
            accessToken,
            refreshToken,
          }
        } catch (error) {
          logger.error('Authorization error', error, {
            component: 'auth.config',
            operation: 'authorize',
          })
          return null
        }
      },
    }),
  ],

  // Callbacks for session and JWT customization
  callbacks: {
    async jwt({ token, user, account }) {
      // Initial sign in
      if (user) {
        token.sub = user.id
        token.email = user.email
        // Extract optional fields with proper type narrowing (no unsafe assertions)
        const userData = user as Record<string, unknown>
        token.role = typeof userData.role === 'string' ? userData.role : 'user'
        token.accessToken = typeof userData.accessToken === 'string' ? userData.accessToken : ''
        token.refreshToken = typeof userData.refreshToken === 'string' ? userData.refreshToken : undefined
        token.expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60
      }

      // Refresh token if approaching expiration
      if (token.expiresAt && Math.floor(Date.now() / 1000) + 60 * 60 > token.expiresAt) {
        try {
          if (token.refreshToken) {
            // Verify refresh token is still valid
            const refreshPayload = jwt.verify(token.refreshToken, JWT_SECRET) as JWTPayload

            // Generate new access token
            token.accessToken = generateAccessToken(token.sub, token.email, token.role)
            token.expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60

            logger.info('JWT token refreshed', {
              component: 'auth.config',
              operation: 'jwt_callback',
              userId: token.sub,
            })
          }
        } catch (error) {
          logger.error('Token refresh failed', error, {
            component: 'auth.config',
            operation: 'jwt_callback',
          })
        }
      }

      return token
    },

    async session({ session, token }) {
      session.user = {
        id: token.sub,
        email: token.email,
        role: token.role as 'admin' | 'user' | 'viewer',
      }
      session.accessToken = token.accessToken
      session.refreshToken = token.refreshToken
      session.expiresAt = token.expiresAt

      return session
    },

    async redirect({ url, baseUrl }) {
      // Redirect to home after sign in if no callback URL
      if (url.startsWith('/')) return `${baseUrl}${url}`
      else if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
  },

  // Events for logging and monitoring
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      logger.info('User signed in', {
        component: 'auth.config',
        operation: 'signIn_event',
        userId: user?.id,
        email: user?.email,
      })
    },

    async signOut({ token }) {
      logger.info('User signed out', {
        component: 'auth.config',
        operation: 'signOut_event',
        userId: token?.sub,
      })
    },

    async error({ error }) {
      logger.error('NextAuth error', new Error(error), {
        component: 'auth.config',
        operation: 'error_event',
        error,
      })
    },
  },

  // Security settings
  secret: NEXT_AUTH_SECRET,
  trustHost: true,
})

/**
 * Helper function to generate access token
 * Matches existing JWT implementation in lib/auth.ts
 */
function generateAccessToken(userId: string, email: string, role: string = 'user'): string {
  return jwt.sign(
    {
      sub: userId,
      email,
      role,
    },
    JWT_SECRET,
    { expiresIn: 24 * 60 * 60 } // 24 hours
  )
}

/**
 * Helper function to generate refresh token
 * Matches existing JWT implementation in lib/auth.ts
 */
function generateRefreshToken(userId: string, email: string): string {
  return jwt.sign(
    {
      sub: userId,
      email,
      type: 'refresh',
    },
    JWT_SECRET,
    { expiresIn: 7 * 24 * 60 * 60 } // 7 days
  )
}

/**
 * User credential validation - PASSWORD-BASED AUTHENTICATION
 *
 * IMPLEMENTATION GUIDE:
 * This function currently returns null (password-based auth disabled).
 * For production, connect to your user database and bcrypt password verification.
 *
 * Step 1: Install bcrypt: npm install bcrypt
 * Step 2: Import: import bcrypt from 'bcrypt'
 * Step 3: Uncomment the code below and replace 'db.users' with your actual database module
 *
 * SECURITY NOTES:
 * - Never log the user's password or password hash
 * - Always use bcrypt for password hashing and comparison
 * - Use constant-time comparison to prevent timing attacks
 * - Enforce password validation rules from PASSWORD_VALIDATION (shared constants)
 * - Rate-limit failed attempts in your login endpoint
 */
async function validateUserCredentials(
  email: string,
  password: string
): Promise<{ id: string; email: string; role: 'admin' | 'user' | 'viewer' } | null> {
  try {
    // Input validation
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      logger.warn('Invalid credential format', {
        component: 'auth.config',
        operation: 'validateUserCredentials',
      })
      return null
    }

    // IMPLEMENTATION TEMPLATE (uncomment when database is ready):
    // import bcrypt from 'bcrypt'
    // import { db } from '@/lib/db' // Your database module
    //
    // const user = await db.users.findByEmail(email.toLowerCase())
    // if (!user) {
    //   // Prevent timing attacks by still running bcrypt comparison
    //   await bcrypt.compare(password, '$2b$10$dummy-hash-to-prevent-timing-attack')
    //   return null
    // }
    //
    // const isValidPassword = await bcrypt.compare(password, user.password_hash)
    // if (!isValidPassword) {
    //   logger.warn('Failed password authentication attempt', {
    //     component: 'auth.config',
    //     email: email.toLowerCase(),
    //   })
    //   return null
    // }
    //
    // logger.info('User authenticated via password', {
    //   component: 'auth.config',
    //   userId: user.id,
    //   email: user.email,
    // })
    //
    // return {
    //   id: user.id,
    //   email: user.email,
    //   role: user.role || 'user',
    // }

    // CURRENT: Token-based authentication only
    logger.warn('Password-based authentication is not configured. Using token-based auth only.', {
      component: 'auth.config',
      operation: 'validateUserCredentials',
    })

    return null
  } catch (error) {
    logger.error('Password authentication error', error as Error, {
      component: 'auth.config',
      operation: 'validateUserCredentials',
    })
    return null
  }
}
