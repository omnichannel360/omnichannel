'use client'

import React, { useEffect, useState } from 'react'
import { StatCard, ErrorState } from './StatCard'

interface Metrics {
  operations?: { agents_deployed?: number; skills_available?: number }
  performance?: { uptime_percent?: number }
  user_activity?: { total_meetings_processed?: number; avg_task_completion_time_minutes?: number }
}

interface Task {
  status: string
}

const STATUS_LABELS: Record<string, string> = { todo: 'To do', 'in-progress': 'In progress', done: 'Done' }

export function DeliveryMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetch('/api/metrics').then(r => r.json()), fetch('/api/kanban').then(r => r.json())])
      .then(([m, k]) => {
        if (!m.success) {
          setError(m.error || 'Delivery metrics unavailable')
          return
        }
        setMetrics(m.data as Metrics)
        if (k.success && Array.isArray(k.data)) setTasks(k.data as Task[])
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Request failed'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-5 text-gray-500">Loading metrics...</div>
  if (error || !metrics) return <ErrorState message={error || 'No data'} />

  const counts = tasks.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.status]: (acc[t.status] || 0) + 1 }), {})
  const total = tasks.length
  const done = counts.done || 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Agents deployed" value={String(metrics.operations?.agents_deployed ?? 0)} />
        <StatCard label="Skills available" value={String(metrics.operations?.skills_available ?? 0)} accent="#3b82f6" />
        <StatCard label="Uptime" value={`${metrics.performance?.uptime_percent ?? 0}%`} accent="#8b5cf6" />
        <StatCard label="Meetings processed" value={String(metrics.user_activity?.total_meetings_processed ?? 0)} accent="#f59e0b" />
        <StatCard
          label="Avg task completion"
          value={`${metrics.user_activity?.avg_task_completion_time_minutes ?? 0} min`}
          accent="#ec4899"
        />
        <StatCard label="Tasks completed" value={`${done} / ${total}`} hint="From Kanban board" accent="#10b981" />
      </div>

      {total > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Task pipeline</h3>
          <div className="space-y-3">
            {Object.keys(STATUS_LABELS).map(status => {
              const count = counts[status] || 0
              return (
                <div key={status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700">{STATUS_LABELS[status]}</span>
                    <span className="text-gray-500">{count}</span>
                  </div>
                  <div className="h-3 rounded bg-gray-200 overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${(count / total) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
