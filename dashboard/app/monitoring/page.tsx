'use client'

import { useEffect, useState } from 'react'

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  components: {
    meetings_api: { status: string; response_time_ms: number }
    conductor_api: { status: string; response_time_ms: number }
    company_brain: { status: string; log_count: number; latest_timestamp: string | null }
    skill_registry: { status: string; skill_count: number }
  }
  metrics: {
    total_meetings_processed: number
    total_skills_triggered: number
    success_rate: number
    recent_logs: number
  }
  alerts: string[]
}

export default function MonitoringPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const fetchHealth = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/health')
      if (!response.ok) throw new Error('Health check failed')
      const data = await response.json()
      setHealth(data)
      setLastRefresh(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 10000)
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status: string) => {
    if (status === 'healthy') return 'text-green-600'
    if (status === 'degraded') return 'text-yellow-600'
    return 'text-red-600'
  }

  const getStatusBg = (status: string) => {
    if (status === 'healthy') return 'bg-green-50'
    if (status === 'degraded') return 'bg-yellow-50'
    return 'bg-red-50'
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">System Monitoring</h1>
          <p className="text-gray-600">Phase 5: Meeting System Health</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">{lastRefresh.toLocaleTimeString()}</p>
          <button
            onClick={fetchHealth}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-red-800">Error: {error}</p>
        </div>
      )}

      {health && (
        <div className="space-y-6">
          <div className={`p-6 rounded-lg ${getStatusBg(health.status)}`}>
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold mb-2">Status</h2>
                <p className={`text-2xl font-bold ${getStatusColor(health.status)}`}>
                  {health.status.toUpperCase()}
                </p>
              </div>
              <div className="text-sm text-gray-600">
                <p>{new Date(health.timestamp).toLocaleTimeString()}</p>
              </div>
            </div>
          </div>

          {health.alerts.length > 0 && (
            <div className="p-6 bg-white rounded-lg border border-gray-200">
              <h3 className="text-lg font-bold mb-4">Alerts ({health.alerts.length})</h3>
              <ul className="space-y-2">
                {health.alerts.map((alert, i) => (
                  <li key={i} className="p-3 bg-gray-50 rounded text-sm">
                    {alert}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-white rounded-lg border border-gray-200">
              <h3 className="font-bold mb-2">Meetings API</h3>
              <p className="text-sm text-gray-600">
                {health.components.meetings_api.status} ({health.components.meetings_api.response_time_ms}ms)
              </p>
            </div>

            <div className="p-4 bg-white rounded-lg border border-gray-200">
              <h3 className="font-bold mb-2">Conductor API</h3>
              <p className="text-sm text-gray-600">{health.components.conductor_api.status}</p>
            </div>

            <div className="p-4 bg-white rounded-lg border border-gray-200">
              <h3 className="font-bold mb-2">Company-Brain</h3>
              <p className="text-sm text-gray-600">
                {health.components.company_brain.status} ({health.components.company_brain.log_count} logs)
              </p>
            </div>

            <div className="p-4 bg-white rounded-lg border border-gray-200">
              <h3 className="font-bold mb-2">Skill Registry</h3>
              <p className="text-sm text-gray-600">
                {health.components.skill_registry.status} ({health.components.skill_registry.skill_count} skills)
              </p>
            </div>
          </div>

          <div className="p-6 bg-white rounded-lg border border-gray-200">
            <h3 className="text-lg font-bold mb-4">Metrics</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Meetings</p>
                <p className="text-2xl font-bold">{health.metrics.total_meetings_processed}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Skills Triggered</p>
                <p className="text-2xl font-bold">{health.metrics.total_skills_triggered}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Success Rate</p>
                <p className="text-2xl font-bold">{(health.metrics.success_rate * 100).toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Brain Logs</p>
                <p className="text-2xl font-bold">{health.metrics.recent_logs}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && !health && (
        <div className="text-center py-12">
          <p className="text-gray-600">Loading...</p>
        </div>
      )}
    </div>
  )
}
