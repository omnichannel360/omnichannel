/**
 * Example: Making Authenticated API Requests
 *
 * This file demonstrates how to:
 * 1. Generate JWT tokens
 * 2. Make authenticated requests to protected endpoints
 * 3. Handle authentication errors
 */

import { createToken, JWTPayload } from '@/lib/auth'

// ============================================================================
// 1. CREATE TOKEN (Server-Side Only)
// ============================================================================

/**
 * Create a JWT token for a user
 * This is typically done during login/signup
 */
export async function generateUserToken(userId: string, email: string, role: string = 'user') {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: userId,
    email,
    role,
  }

  return await createToken(payload)
}

// ============================================================================
// 2. CLIENT-SIDE: MAKE AUTHENTICATED REQUESTS
// ============================================================================

/**
 * Base function for authenticated API calls
 */
async function authenticatedFetch(
  endpoint: string,
  token: string,
  options: RequestInit = {}
) {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (response.status === 401) {
    // Token is invalid or expired
    console.error('Authentication failed. Please login again.')
    // In a real app, redirect to login page
    throw new Error('Unauthorized: Invalid or expired token')
  }

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'API request failed')
  }

  return response.json()
}

// ============================================================================
// 3. EXAMPLE API CALLS
// ============================================================================

/**
 * ALERTS API Examples
 */
export async function getAlerts(token: string) {
  return authenticatedFetch('/api/alerts', token, {
    method: 'GET',
  })
}

export async function createAlert(
  token: string,
  level: 'info' | 'warning' | 'critical',
  component: string,
  message: string
) {
  return authenticatedFetch('/api/alerts', token, {
    method: 'POST',
    body: JSON.stringify({ level, component, message }),
  })
}

export async function updateAlertStatus(
  token: string,
  alertId: string,
  status: 'active' | 'resolved'
) {
  return authenticatedFetch('/api/alerts', token, {
    method: 'PATCH',
    body: JSON.stringify({ alert_id: alertId, status }),
  })
}

/**
 * MEETINGS API Examples
 */
export async function getMeetings(token: string) {
  return authenticatedFetch('/api/meetings', token, {
    method: 'GET',
  })
}

export async function logMeeting(token: string, message: string, participants?: string[]) {
  return authenticatedFetch('/api/meetings', token, {
    method: 'POST',
    body: JSON.stringify({ message, participants }),
  })
}

/**
 * KANBAN API Examples
 */
export async function getTasks(token: string) {
  return authenticatedFetch('/api/kanban', token, {
    method: 'GET',
  })
}

export async function createTask(token: string, title: string, status: string = 'todo') {
  return authenticatedFetch('/api/kanban', token, {
    method: 'POST',
    body: JSON.stringify({ title, status }),
  })
}

export async function updateTask(token: string, id: string, updates: Record<string, any>) {
  return authenticatedFetch('/api/kanban', token, {
    method: 'PUT',
    body: JSON.stringify({ id, ...updates }),
  })
}

export async function deleteTask(token: string, id: string) {
  return authenticatedFetch(`/api/kanban?id=${id}`, token, {
    method: 'DELETE',
  })
}

/**
 * CONDUCTOR API Examples
 */
export async function getConductorLogs(token: string) {
  return authenticatedFetch('/api/conductor', token, {
    method: 'GET',
  })
}

export async function dispatchTask(token: string, message: string) {
  return authenticatedFetch('/api/conductor', token, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

/**
 * METRICS API Examples
 */
export async function getMetrics(token: string) {
  return authenticatedFetch('/api/metrics', token, {
    method: 'GET',
  })
}

/**
 * BRAIN API Examples
 */
export async function getMemories(token: string, category?: string, limit: number = 20) {
  const params = new URLSearchParams()
  if (category) params.append('category', category)
  params.append('limit', String(limit))

  return authenticatedFetch(`/api/brain?${params}`, token, {
    method: 'GET',
  })
}

/**
 * PROFILES API Examples
 */
export async function getProfiles(token: string) {
  return authenticatedFetch('/api/profiles', token, {
    method: 'GET',
  })
}

// ============================================================================
// 4. USAGE EXAMPLE (In a React Component)
// ============================================================================

/*
import { useEffect, useState } from 'react'

export function AlertsDashboard() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        setLoading(true)
        const token = localStorage.getItem('authToken')
        if (!token) {
          setError('Please login first')
          return
        }

        const data = await getAlerts(token)
        setAlerts(data.alerts)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load alerts')
      } finally {
        setLoading(false)
      }
    }

    loadAlerts()
  }, [])

  if (loading) return <div>Loading...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <div>
      <h1>Alerts</h1>
      {alerts.map(alert => (
        <div key={alert.id} className={`alert alert-${alert.level}`}>
          {alert.message}
        </div>
      ))}
    </div>
  )
}
*/

// ============================================================================
// 5. TESTING WITH CURL
// ============================================================================

/*
Generate a test token:
  npm run dev &  # Start dev server
  node -e "
    const { createToken } = require('./lib/auth');
    createToken({ sub: 'test-user', email: 'test@example.com', role: 'user' })
      .then(token => console.log('Token:', token));
  "

Then use it in requests:
  curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
    http://localhost:3000/api/alerts

Or without token (should fail with 401):
  curl http://localhost:3000/api/alerts
*/

// ============================================================================
// 6. ERROR HANDLING PATTERNS
// ============================================================================

export async function safeApiCall<T>(
  fetcher: () => Promise<T>,
  options?: {
    onUnauthorized?: () => void
    onError?: (error: Error) => void
  }
): Promise<T | null> {
  try {
    return await fetcher()
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Unauthorized')) {
        options?.onUnauthorized?.()
      } else {
        options?.onError?.(error)
      }
    }
    return null
  }
}

/*
Usage:
const alerts = await safeApiCall(
  () => getAlerts(token),
  {
    onUnauthorized: () => {
      // Redirect to login
      window.location.href = '/login'
    },
    onError: (err) => {
      console.error('Failed to fetch alerts:', err)
    }
  }
)
*/
