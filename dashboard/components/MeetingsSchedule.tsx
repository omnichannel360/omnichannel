'use client'

import React from 'react'

interface Meeting {
  id: string
  title: string
  time: string
  attendees: number
  status: 'upcoming' | 'in-progress' | 'completed'
}

export function MeetingsSchedule() {
  const meetings: Meeting[] = [
    { id: '1', title: 'Daily Standup', time: '10:00 AM', attendees: 8, status: 'completed' },
    { id: '2', title: 'Sprint Planning', time: '2:00 PM', attendees: 12, status: 'upcoming' },
    { id: '3', title: 'Design Critique', time: '3:30 PM', attendees: 5, status: 'upcoming' }
  ]

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
