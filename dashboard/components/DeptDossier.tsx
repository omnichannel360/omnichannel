'use client'

import React, { useEffect, useState } from 'react'

interface DeptDossierProps {
  deptId: string
}

export function DeptDossier({ deptId }: DeptDossierProps) {
  const [metrics, setMetrics] = useState({
    teamSize: 12,
    budget: 480000,
    okrProgress: 85,
    velocity: 42,
    headcount: 10,
    attrition: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.team) {
          const team = data.data.team
          setMetrics({
            teamSize: team.total_agents,
            budget: 480000,
            okrProgress: 85,
            velocity: 42,
            headcount: team.active_agents,
            attrition: 0
          })
        }
      })
      .finally(() => setLoading(false))
  }, [deptId])

  if (loading) return <div>Loading...</div>

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div>
          <h3 style={{ fontWeight: '600', marginBottom: '10px' }}>Department Overview</h3>
          <div style={{
            backgroundColor: '#f9fafb',
            padding: '15px',
            borderRadius: '6px'
          }}>
            <p><strong>Department:</strong> {deptId.charAt(0).toUpperCase() + deptId.slice(1)}</p>
            <p><strong>Team Size:</strong> {metrics.teamSize} people</p>
            <p><strong>Budget:</strong> ${(metrics.budget / 1000).toFixed(0)}K/year</p>
            <p><strong>Lead:</strong> Department Manager</p>
          </div>
        </div>

        <div>
          <h3 style={{ fontWeight: '600', marginBottom: '10px' }}>Q4 Metrics</h3>
          <div style={{
            backgroundColor: '#f9fafb',
            padding: '15px',
            borderRadius: '6px'
          }}>
            <p><strong>OKR Progress:</strong> {metrics.okrProgress}%</p>
            <p><strong>Velocity:</strong> {metrics.velocity} points/sprint</p>
            <p><strong>Headcount:</strong> {metrics.headcount}/{metrics.teamSize} filled</p>
            <p><strong>Attrition Rate:</strong> {metrics.attrition}%</p>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontWeight: '600', marginBottom: '10px' }}>Key Initiatives</h3>
        <div style={{
          backgroundColor: '#f9fafb',
          padding: '15px',
          borderRadius: '6px'
        }}>
          <ul style={{ marginLeft: '20px', color: '#666', fontSize: '14px' }}>
            <li>Build new dashboard interface</li>
            <li>Optimize API performance</li>
            <li>Implement monitoring system</li>
          </ul>
        </div>
      </div>

      <div>
        <h3 style={{ fontWeight: '600', marginBottom: '10px' }}>Recent Hires</h3>
        <div style={{ backgroundColor: '#f9fafb', padding: '15px', borderRadius: '6px' }}>
          <p style={{ fontSize: '12px', color: '#666' }}>
            2 new team members onboarded in October. 1 position open for senior engineer.
          </p>
        </div>
      </div>
    </div>
  )
}
