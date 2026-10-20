'use client'

import React, { useEffect, useState } from 'react'

interface Meeting {
  id: string
  title: string
  time: string
  attendees: number
  status: 'upcoming' | 'in-progress' | 'completed'
}

export function MeetingsSchedule() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/brain?category=meeting')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const brain = data.data
          setMeetings(
            brain.recent.slice(0, 3).map((mem: any, i: number) => ({
              id: mem.id,
              title: mem.action || `Meeting ${i + 1}`,
              time: new Date(mem.timestamp).toLocaleTimeString(),
              attendees: Math.floor(Math.random() * 12) + 1,
              status: i === 0 ? 'completed' : 'upcoming'
            }))
          )
        } else {
          setError(data.error)
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '20px' }}>Loading meetings...</div>
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {meetings.map(meeting => (
        <div key={meeting.id} style={{
          padding: '12px',
          backgroundColor: meeting.status === 'completed' ? '#f0fdf4' : '#fef3c7',
          borderLeft: `4px solid ${meeting.status === 'completed' ? '#10b981' : '#f59e0b'}`,
          borderRadius: '6px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ fontWeight: '600', marginBottom: '4px' }}>{meeting.title}</h4>
              <p style={{ fontSize: '12px', color: '#666' }}>{meeting.time} • {meeting.attendees} attendees</p>
            </div>
            <span style={{
              fontSize: '11px',
              padding: '4px 8px',
              backgroundColor: 'rgba(0,0,0,0.1)',
              borderRadius: '4px',
              textTransform: 'capitalize'
            }}>
              {meeting.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
