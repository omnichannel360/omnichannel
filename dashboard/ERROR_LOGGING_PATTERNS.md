# Error Logging Integration Patterns

## Pattern 1: Standard API Route Handler

```typescript
// pages/api/alerts/create.ts
import { NextApiRequest, NextApiResponse } from 'next'
import { logger, createLogContext } from '@/lib/logger'
import { validateAlert } from '@/lib/validation'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const context = createLogContext({
    route: '/api/alerts/create',
    method: req.method,
    userId: req.user?.id,
    userEmail: req.user?.email
  })

  try {
    // Validate input
    const validation = validateAlert(req.body)
    if (!validation.success) {
      logger.warn('Alert validation failed', {
        ...context,
        operation: 'validate-alert',
        errors: validation.errors
      })
      return res.status(400).json({ error: 'Invalid alert data' })
    }

    // Create alert
    const alert = await createAlert(validation.data)
    
    logger.info('Alert created successfully', {
      ...context,
      operation: 'create-alert',
      alertId: alert.id,
      level: alert.level,
      duration: Date.now() - new Date(context.timestamp!).getTime()
    })

    res.status(201).json({ success: true, data: alert })
  } catch (error) {
    logger.error('Failed to create alert', error, {
      ...context,
      operation: 'create-alert',
      statusCode: 500
    })

    res.status(500).json({
      error: 'Failed to create alert',
      correlationId: context.correlationId
    })
  }
}
```

## Pattern 2: Database Operation with Error Handling

```typescript
// lib/db/queries.ts
import { logger } from '@/lib/logger'
import { LogContext } from '@/lib/logger'

export async function getUserById(userId: string, context?: LogContext) {
  const startTime = Date.now()
  
  try {
    const user = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    )

    const duration = Date.now() - startTime
    logger.debug('Database query successful', {
      ...context,
      operation: 'get-user',
      duration,
      rowsReturned: user.length
    })

    return user[0] || null
  } catch (error) {
    const duration = Date.now() - startTime
    
    logger.error('Database query failed', error, {
      ...context,
      operation: 'get-user',
      duration,
      // Safe context:
      userId: userId,
      tables: ['users']
      // Dangerous context - avoid:
      // query: 'SELECT * FROM users WHERE id = ...' (never log full query)
      // params: [userId] (might contain sensitive data)
    })

    throw new Error('Failed to fetch user')
  }
}
```

## Pattern 3: External API Integration

```typescript
// lib/api/dataForSeo.ts
import { logger } from '@/lib/logger'

export async function fetchDataForSeoMetrics(domain: string) {
  const context = {
    operation: 'fetch-dfs-metrics',
    service: 'DataForSEO',
    domain: domain
  }

  try {
    const response = await fetch('https://api.dataforseo.com/v3/analytics/google/overview', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.DFS_LOGIN}:${process.env.DFS_PASSWORD}`).toString('base64')}`,
        // Never log the Authorization header value!
      },
      body: JSON.stringify({ domain })
    })

    if (!response.ok) {
      throw new Error(`DataForSEO API error: ${response.status}`)
    }

    const data = await response.json()
    
    logger.debug('DataForSEO API call successful', {
      ...context,
      statusCode: response.status,
      recordsReturned: data.length
    })

    return data
  } catch (error) {
    logger.error('DataForSEO API call failed', error, {
      ...context,
      statusCode: error instanceof Error ? 'unknown' : (error as any).status,
      // Safe: endpoint and domain
      // Unsafe: authorization header, credentials
    })

    throw error
  }
}
```

## Pattern 4: Authentication & Security

```typescript
// lib/auth/authenticate.ts
import { logger } from '@/lib/logger'

export async function authenticateUser(email: string, password: string) {
  const context = {
    operation: 'authenticate-user',
    email: email, // Safe to log email (username)
    route: '/api/auth/login'
  }

  try {
    const user = await db.query('SELECT * FROM users WHERE email = $1', [email])
    
    if (!user) {
      logger.warn('User not found', {
        ...context,
        operation: 'authenticate-user',
        result: 'user-not-found'
      })
      // Omit password - never log it
      throw new Error('Invalid credentials')
    }

    const passwordValid = await verifyPassword(password, user.password_hash)
    
    if (!passwordValid) {
      logger.warn('Invalid password attempt', {
        ...context,
        operation: 'authenticate-user',
        result: 'invalid-password',
        attemptCount: user.failed_attempts
      })
      // DO NOT LOG:
      // password: password
      // password_hash: user.password_hash
      
      throw new Error('Invalid credentials')
    }

    logger.info('User authenticated', {
      ...context,
      operation: 'authenticate-user',
      userId: user.id,
      result: 'success'
    })

    return {
      token: generateToken(user),
      user: { id: user.id, email: user.email, name: user.name }
    }
  } catch (error) {
    logger.error('Authentication failed', error, {
      ...context,
      operation: 'authenticate-user',
      error: error instanceof Error ? error.message : 'unknown'
    })
    throw error
  }
}
```

## Pattern 5: Async Job/Background Task

```typescript
// lib/jobs/processAlerts.ts
import { logger } from '@/lib/logger'

export async function processPendingAlerts() {
  const jobId = `job-${Date.now()}`
  const context = {
    operation: 'process-alerts',
    jobId: jobId,
    startTime: new Date().toISOString()
  }

  logger.info('Alert processing started', context)

  let processedCount = 0
  let errorCount = 0

  try {
    const alerts = await db.query(
      'SELECT * FROM alerts WHERE status = $1 LIMIT 100',
      ['pending']
    )

    logger.debug('Alerts retrieved', {
      ...context,
      alertCount: alerts.length
    })

    for (const alert of alerts) {
      try {
        const result = await processAlert(alert)
        processedCount++
        
        logger.debug('Alert processed', {
          ...context,
          alertId: alert.id,
          result: result.status
        })
      } catch (error) {
        errorCount++
        logger.error('Alert processing failed', error, {
          ...context,
          alertId: alert.id,
          operation: 'process-single-alert'
        })
        // Continue processing other alerts
      }
    }

    logger.info('Alert processing completed', {
      ...context,
      operation: 'process-alerts',
      processedCount: processedCount,
      errorCount: errorCount,
      duration: Date.now() - new Date(context.startTime).getTime()
    })
  } catch (error) {
    logger.error('Alert processing failed critically', error, {
      ...context,
      operation: 'process-alerts',
      processedCount: processedCount,
      errorCount: errorCount
    })
    throw error
  }
}
```

## Pattern 6: Middleware Integration

```typescript
// middleware/requestLogger.ts
import { NextRequest, NextResponse } from 'next/server'
import { logger, createLogContext } from '@/lib/logger'

export function middleware(request: NextRequest) {
  const startTime = Date.now()
  const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`

  const context = createLogContext({
    correlationId: requestId,
    route: request.nextUrl.pathname,
    method: request.method,
    userAgent: request.headers.get('user-agent')
  })

  // Store in response headers
  const response = NextResponse.next()
  response.headers.set('x-correlation-id', context.correlationId!)
  response.headers.set('x-request-id', requestId)

  // Log after response
  const duration = Date.now() - startTime
  logger.debug('Request handled', {
    ...context,
    duration: duration,
    statusCode: response.status
  })

  return response
}

export const config = {
  matcher: ['/api/:path*']
}
```

## Pattern 7: Batch Operations with Progress Logging

```typescript
// lib/batch/importUsers.ts
import { logger } from '@/lib/logger'

export async function importUsersFromCSV(csvPath: string) {
  const context = {
    operation: 'import-users',
    source: csvPath,
    startTime: new Date().toISOString()
  }

  logger.info('User import started', context)

  let importedCount = 0
  let errorCount = 0
  const errors: string[] = []

  try {
    const records = await readCSV(csvPath)
    
    logger.debug('CSV file read', {
      ...context,
      recordCount: records.length
    })

    for (let i = 0; i < records.length; i++) {
      try {
        const user = await createUser(records[i])
        importedCount++

        // Log progress every 100 records
        if ((i + 1) % 100 === 0) {
          logger.info('Import progress', {
            ...context,
            importedCount: importedCount,
            errorCount: errorCount,
            progress: `${((i + 1) / records.length * 100).toFixed(1)}%`
          })
        }
      } catch (error) {
        errorCount++
        const errorMsg = error instanceof Error ? error.message : String(error)
        errors.push(`Row ${i + 1}: ${errorMsg}`)

        logger.warn('User import failed for record', {
          ...context,
          rowNumber: i + 1,
          error: errorMsg
        })
      }
    }

    logger.info('User import completed', {
      ...context,
      importedCount: importedCount,
      errorCount: errorCount,
      totalCount: records.length,
      duration: Date.now() - new Date(context.startTime).getTime(),
      successRate: `${((importedCount / records.length) * 100).toFixed(1)}%`
    })

    return {
      importedCount,
      errorCount,
      errors: errors.slice(0, 10) // Return first 10 errors
    }
  } catch (error) {
    logger.error('User import failed', error, {
      ...context,
      operation: 'import-users',
      importedCount: importedCount,
      errorCount: errorCount
    })
    throw error
  }
}
```

## Pattern 8: Error Recovery with Retry Logic

```typescript
// lib/utils/retry.ts
import { logger } from '@/lib/logger'
import { LogContext } from '@/lib/logger'

export async function retryOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3,
  context?: LogContext
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation()
      
      if (attempt > 1) {
        logger.info('Operation succeeded after retry', {
          ...context,
          operation: operationName,
          attempt: attempt,
          retries: attempt - 1
        })
      }
      
      return result
    } catch (error) {
      lastError = error as Error
      
      logger.warn(`Operation attempt ${attempt} failed`, {
        ...context,
        operation: operationName,
        attempt: attempt,
        maxRetries: maxRetries,
        error: lastError.message
      })

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000) // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  logger.error(`Operation failed after ${maxRetries} attempts`, lastError, {
    ...context,
    operation: operationName,
    attempts: maxRetries
  })

  throw lastError
}
```

## Pattern 9: Conditional Debug Logging

```typescript
// lib/debug/dataFetcher.ts
import { logger } from '@/lib/logger'

export async function fetchAndProcessData(sourceId: string) {
  const context = {
    operation: 'fetch-and-process',
    sourceId: sourceId
  }

  try {
    const data = await fetchFromSource(sourceId)
    
    // Debug logs - only in development or when explicitly enabled
    if (process.env.DEBUG_MODE === 'true') {
      logger.debug('Raw data fetched', {
        ...context,
        recordCount: data.length,
        sampleRecord: data[0] // First record structure
      })
    }

    const processed = await processData(data)

    logger.info('Data processing completed', {
      ...context,
      recordsProcessed: processed.length,
      duration: processed.processingTimeMs
    })

    return processed
  } catch (error) {
    logger.error('Data fetch/process failed', error, {
      ...context,
      operation: 'fetch-and-process'
    })
    throw error
  }
}
```

## Pattern 10: Validation Error with Details

```typescript
// lib/validation/strict.ts
import { logger } from '@/lib/logger'

export function validateRequest(data: unknown, schema: any, context?: any) {
  try {
    const validated = schema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    logger.warn('Request validation failed', {
      ...context,
      operation: 'validate-request',
      error: error instanceof Error ? error.message : 'unknown',
      // Log field names, not values:
      invalidFields: (error as any).errors?.map((e: any) => e.path.join('.')) || []
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed'
    }
  }
}
```

---

## Summary of Patterns

| Pattern | Use Case | Log Level |
|---------|----------|-----------|
| Standard Route Handler | API endpoints | info/error |
| Database Queries | Data access | debug/error |
| External APIs | Third-party services | debug/error |
| Authentication | User login/auth | warn/error |
| Background Jobs | Async tasks | info/error |
| Middleware | Request handling | debug |
| Batch Operations | Bulk processing | info/warn |
| Retry Logic | Resilience | warn/info |
| Debug Logging | Development | debug |
| Validation | Input checking | warn |

All patterns automatically handle **sensitive data redaction** and **correlation ID propagation**.
