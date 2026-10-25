'use client'

import React, { useEffect, useState } from 'react'
import { EmptyState, ErrorState } from './StatCard'

interface Memory {
  id: string
  action?: string
  timestamp?: string
}

export function MeetingsSchedule() {
  const [meetings, setMeetings] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/brain?category=meeting')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMeetings(Array.isArray(data.data?.recent) ? (data.data.recent as Memory[]) : [])
        } else {
          setError(data.error || 'Meetings unavailable')
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Request failed'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-5 text-gray-500">Loading meetings...</div>
  if (error) return <ErrorState message={error} />
  if (meetings.length === 0) {
    return <EmptyState title="No meetings recorded yet" detail="Meetings logged by agents will appear here." />
  }

  return (
    <div className="flex flex-col gap-3">
      {meetings.slice(0, 10).map((m, i) => (
        <div key={m.id || i} className="rounded-md bg-amber-50 p-3" style={{ borderLeft: '4px solid #f59e0b' }}>
          <h4 className="font-semibold text-gray-900">{m.action || `Meeting ${i + 1}`}</h4>
          {m.timestamp && <p className="text-xs text-gray-500">{new Date(m.timestamp).toLocaleString()}</p>}
        </div>
      ))}
    </div>
  )
}
