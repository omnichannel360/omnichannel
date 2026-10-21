#!/usr/bin/env node

/**
 * Verification Script: Auth Middleware Protection
 *
 * This script verifies that all API endpoints are properly protected with authentication
 *
 * Usage: npx ts-node scripts/verify-auth-protection.ts
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

interface VerificationResult {
  endpoint: string
  protected: boolean
  hasRateLimit: boolean
  hasRoleCheck: boolean
  issues: string[]
}

const RESULTS: VerificationResult[] = []

// Routes that should be protected
const REQUIRED_PROTECTED_ROUTES = [
  'alerts',
  'brain',
  'conductor',
  'kanban',
  'meetings',
  'metrics',
  'profiles',
]

// Routes that should NOT be protected
const REQUIRED_PUBLIC_ROUTES = ['health']

// Routes that are for auth only
const AUTH_ROUTES = ['auth']

function checkFile(filePath: string, endpoint: string): VerificationResult {
  const result: VerificationResult = {
    endpoint,
    protected: false,
    hasRateLimit: false,
    hasRoleCheck: false,
    issues: [],
  }

  try {
    const content = readFileSync(filePath, 'utf-8')

    // Check for auth protection
    if (content.includes('protectRoute') || content.includes('withAuthProtection')) {
      result.protected = true
    }

    // Check for rate limiting
    if (content.includes('rateLimitKey') || content.includes('applyRateLimit')) {
      result.hasRateLimit = true
    }

    // Check for role-based access
    if (content.includes('requiredRoles') || content.includes('role')) {
      result.hasRoleCheck = true
    }

    // Check for old-style unprotected auth
    if (content.includes('export async function GET') && !result.protected) {
      result.issues.push('Uses legacy unprotected route handler')
    }

    return result
  } catch (error) {
    result.issues.push(`Error reading file: ${(error as Error).message}`)
    return result
  }
}

function verifyApiRoutes() {
  const apiDir = join(process.cwd(), 'app', 'api')

  console.log('🔍 Verifying Auth Middleware Protection\n')
  console.log(`📁 Scanning: ${apiDir}\n`)

  // Scan all route directories
  const routes = readdirSync(apiDir).filter(
    name => !name.startsWith('_') && !name.startsWith('.')
  )

  for (const route of routes) {
    const routePath = join(apiDir, route)
    const routeFile = join(routePath, 'route.ts')

    try {
      const routeStat = require('fs').statSync(routeFile)
      if (routeStat.isFile()) {
        const result = checkFile(routeFile, route)
        RESULTS.push(result)
      }
    } catch {
      // File might not exist, skip
    }
  }
}

function verifyProtectionStatus() {
  console.log('📋 Protection Status\n')

  let allProtected = true
  let allRateLimited = true

  for (const result of RESULTS) {
    const isRequired = REQUIRED_PROTECTED_ROUTES.includes(result.endpoint)
    const isPublic = REQUIRED_PUBLIC_ROUTES.includes(result.endpoint)
    const isAuth = AUTH_ROUTES.includes(result.endpoint)

    let status = '❓'
    let details = ''

    if (isPublic) {
      status = '🔓'
      details = 'Public endpoint (OK)'
    } else if (isAuth) {
      status = '🔑'
      details = 'Auth endpoint (rate-limited)'
    } else if (isRequired) {
      if (result.protected) {
        status = '✅'
        details = 'Protected (OK)'
      } else {
        status = '❌'
        details = 'MISSING PROTECTION'
        allProtected = false
      }
    } else {
      status = '⚠️'
      details = 'Unspecified endpoint'
    }

    console.log(`${status} /api/${result.endpoint}`)
    console.log(`   ${details}`)

    if (!result.hasRateLimit && !isPublic) {
      console.log(`   ⚠️  Missing rate limit configuration`)
      allRateLimited = false
    }

    if (result.issues.length > 0) {
      result.issues.forEach(issue => {
        console.log(`   ❌ ${issue}`)
      })
    }

    console.log('')
  }

  return { allProtected, allRateLimited }
}

function generateReport() {
  const { allProtected, allRateLimited } = verifyProtectionStatus()

  console.log('\n📊 Summary\n')
  console.log(`Total endpoints checked: ${RESULTS.length}`)
  console.log(
    `Protected endpoints: ${RESULTS.filter(r => r.protected).length}/${
      REQUIRED_PROTECTED_ROUTES.length
    }`
  )
  console.log(
    `Rate-limited endpoints: ${RESULTS.filter(r => r.hasRateLimit).length}/${
      RESULTS.length
    }`
  )

  console.log('\n🎯 Recommendations\n')

  if (!allProtected) {
    console.log('❌ CRITICAL: Some endpoints are not protected')
    console.log('   Action: Implement auth protection on unprotected endpoints')
  } else {
    console.log('✅ All required endpoints are protected')
  }

  if (!allRateLimited) {
    console.log('⚠️  Some endpoints lack rate limiting')
    console.log('   Action: Add rateLimitKey configuration to all endpoints')
  } else {
    console.log('✅ All endpoints have rate limiting configured')
  }

  console.log('\n📚 Documentation\n')
  console.log('See AUTH_MIDDLEWARE_IMPLEMENTATION.md for:')
  console.log('  - Usage patterns')
  console.log('  - Configuration options')
  console.log('  - Best practices')
  console.log('  - Troubleshooting')

  // Exit with error if critical issues found
  if (!allProtected) {
    process.exit(1)
  }
}

// Run verification
verifyApiRoutes()
generateReport()
