'use client'

interface AgentDossierProps {
  agentId: string
}

interface AgentMetrics {
  tasksCompleted: number
  successRate: number
  averageResponseTime: number
  lastActive: string
}

export function AgentDossier({ agentId }: AgentDossierProps) {
  // Mock data - replace with real data source
  const metrics: AgentMetrics = {
    tasksCompleted: 127,
    successRate: 94.2,
    averageResponseTime: 1.2,
    lastActive: '2 minutes ago'
  }

  const getStatusColor = (successRate: number): string => {
    if (successRate >= 95) return 'text-green-600'
    if (successRate >= 85) return 'text-yellow-600'
    return 'text-red-600'
  }

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
            <span className="inline-block w-3 h-3 bg-green-500 rounded-full"></span>
            <span className="text-sm font-medium text-gray-700">Active</span>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-3 gap-4 mb-6">
        {/* Tasks Completed */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
            Tasks Completed
          </p>
          <p className="text-2xl font-bold text-blue-900">
            {metrics.tasksCompleted}
          </p>
        </div>

        {/* Success Rate */}
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">
            Success Rate
          </p>
          <p className={`text-2xl font-bold ${getStatusColor(metrics.successRate)}`}>
            {metrics.successRate}%
          </p>
        </div>

        {/* Avg Response Time */}
        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
          <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">
            Avg Response (s)
          </p>
          <p className="text-2xl font-bold text-purple-900">
            {metrics.averageResponseTime}
          </p>
        </div>
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
          <div className="flex items-start gap-3 p-3 bg-green-50 rounded border border-green-200">
            <span className="inline-block w-2 h-2 bg-green-600 rounded-full mt-2"></span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                Task #127 completed successfully
              </p>
              <p className="text-xs text-gray-600 mt-1">5 minutes ago</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded border border-blue-200">
            <span className="inline-block w-2 h-2 bg-blue-600 rounded-full mt-2"></span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                Started processing Task #128
              </p>
              <p className="text-xs text-gray-600 mt-1">2 minutes ago</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded border border-gray-200">
            <span className="inline-block w-2 h-2 bg-gray-400 rounded-full mt-2"></span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                Connected to orchestrator
              </p>
              <p className="text-xs text-gray-600 mt-1">10 minutes ago</p>
            </div>
          </div>
        </div>
      </section>
    </article>
  )
}
