'use client'

import { useMemo } from 'react'

interface AgentDossierProps {
  agentId: string
}

interface AgentMetrics {
  tasksCompleted: number
  successRate: number
  averageResponseTime: number
  lastActive: string
}

interface ActivityLog {
  id: string
  message: string
  timestamp: string
  type: 'success' | 'processing' | 'info'
}

interface MetricCardProps {
  label: string
  value: string | number
  className: string
  borderColor?: string
}

// Extracted component to eliminate duplication
function MetricCard({ label, value, className, borderColor = 'border-gray-200' }: MetricCardProps): JSX.Element {
  return (
    <div className={`${className} rounded-lg p-4 border ${borderColor}`}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold">
        {value}
      </p>
    </div>
  )
}

// Memoized function for status color - moved outside component
function getStatusColor(successRate: number): string {
  // Input validation: handle edge cases
  if (typeof successRate !== 'number' || isNaN(successRate) || !isFinite(successRate)) {
    return 'text-red-600'
  }

  // Clamp to valid percentage range
  const validRate = Math.max(0, Math.min(100, successRate))

  if (validRate >= 95) return 'text-green-600'
  if (validRate >= 85) return 'text-yellow-600'
  return 'text-red-600'
}

export function AgentDossier({ agentId }: AgentDossierProps) {
  // TRACKED: Replace with real data source fetching based on agentId
  // This would typically be a useFetch hook or server component data
  // Ticket: OmniBot-Agent-Dossier-Data-Integration (currently using demo data)
  const metrics: AgentMetrics = useMemo(() => ({
    tasksCompleted: 127,
    successRate: 94.2,
    averageResponseTime: 1.2,
    lastActive: '2 minutes ago'
  }), [agentId])

  // TRACKED: Replace with real activity data fetching based on agentId
  // Ticket: OmniBot-Activity-Log-Integration (currently using demo data)
  const activities: ActivityLog[] = useMemo(() => [
    {
      id: 'activity-1',
      message: 'Task #127 completed successfully',
      timestamp: '5 minutes ago',
      type: 'success'
    },
    {
      id: 'activity-2',
      message: 'Started processing Task #128',
      timestamp: '2 minutes ago',
      type: 'processing'
    },
    {
      id: 'activity-3',
      message: 'Connected to orchestrator',
      timestamp: '10 minutes ago',
      type: 'info'
    }
  ], [agentId])

  const statusColorClass = getStatusColor(metrics.successRate)

  return (
    <article className="w-full max-w-2xl mx-auto p-6">
      {/* Header Section */}
      <header className="mb-6 border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Agent {agentId}
            </h1>
            <p className="text-sm text-gray-600">
              Last active: {metrics.lastActive}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 bg-green-500 rounded-full"
              aria-label="Agent status: Active"
              role="img"
            ></span>
            <span className="text-sm font-medium text-gray-700">Active</span>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="Tasks Completed"
          value={metrics.tasksCompleted}
          className="bg-blue-50 text-blue-900"
          borderColor="border-blue-200"
        />

        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">
            Success Rate
          </p>
          <p className={`text-2xl font-bold ${statusColorClass}`}>
            {metrics.successRate}%
          </p>
        </div>

        <MetricCard
          label="Avg Response (s)"
          value={metrics.averageResponseTime}
          className="bg-purple-50 text-purple-900"
          borderColor="border-purple-200"
        />
      </section>

      {/* Performance Details */}
      <section className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Performance Details
        </h2>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-600">Status</dt>
            <dd className="mt-1 text-base text-gray-900 font-semibold">Active</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-600">Agent ID</dt>
            <dd className="mt-1 text-base text-gray-900 font-mono">{agentId}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-600">Queue Size</dt>
            <dd className="mt-1 text-base text-gray-900">0 pending</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-600">Memory Usage</dt>
            <dd className="mt-1 text-base text-gray-900">42.5 MB</dd>
          </div>
        </dl>
      </section>

      {/* Recent Activities */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Activities
        </h2>
        <div className="space-y-3">
          {activities.map((activity) => {
            const bgColorMap = {
              success: 'bg-green-50 border-green-200',
              processing: 'bg-blue-50 border-blue-200',
              info: 'bg-gray-50 border-gray-200'
            }

            const dotColorMap = {
              success: 'bg-green-600',
              processing: 'bg-blue-600',
              info: 'bg-gray-400'
            }

            const statusLabelMap = {
              success: 'Success',
              processing: 'Processing',
              info: 'Information'
            }

            return (
              <div
                key={activity.id}
                className={`flex items-start gap-3 p-3 rounded border ${bgColorMap[activity.type]}`}
              >
                <span
                  className={`inline-block w-2 h-2 ${dotColorMap[activity.type]} rounded-full mt-2`}
                  aria-label={`Activity status: ${statusLabelMap[activity.type]}`}
                  role="img"
                ></span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {activity.message}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">{activity.timestamp}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </article>
  )
}
