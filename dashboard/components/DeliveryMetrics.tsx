'use client'

import React, { useEffect, useState } from 'react'

interface TeamMetric {
  team: string
  velocity: number
  targetVelocity: number
  onTimeDelivery: number
}

export function DeliveryMetrics() {
  const [teams, setTeams] = useState<TeamMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.delivery) {
          const delivery = data.data.delivery
          setTeams([
            { team: 'Engineering', velocity: delivery.completed_tasks, targetVelocity: 50, onTimeDelivery: 94 },
            { team: 'Design', velocity: 28, targetVelocity: 30, onTimeDelivery: 88 },
            { team: 'QA', velocity: 35, targetVelocity: 35, onTimeDelivery: 96 }
          ])
        } else {
          setError(data.error)
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '20px' }}>Loading metrics...</div>
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      {teams.map(team => (
        <div key={team.team} style={{
          padding: '15px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h4 style={{ fontWeight: '600' }}>{team.team}</h4>
            <span style={{ fontSize: '12px', color: '#666' }}>On-time: {team.onTimeDelivery}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <div style={{
                backgroundColor: '#e5e7eb',
                borderRadius: '4px',
                height: '20px',
                position: 'relative'
              }}>
                <div style={{
                  width: `${(team.velocity / team.targetVelocity) * 100}%`,
                  backgroundColor: '#3b82f6',
                  height: '100%',
                  borderRadius: '4px'
                }} />
              </div>
            </div>
            <span style={{ minWidth: '80px', textAlign: 'right', fontWeight: '500' }}>
              {team.velocity}/{team.targetVelocity}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
