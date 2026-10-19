'use client'

import React from 'react'

interface Metric {
  label: string
  value: string
  trend: number
}

export function FinanceMetrics() {
  const metrics: Metric[] = [
    { label: 'Monthly Revenue', value: '$125,000', trend: 12.5 },
    { label: 'Operating Costs', value: '$45,000', trend: -8.2 },
    { label: 'Gross Margin', value: '64%', trend: 3.1 },
    { label: 'Runway (months)', value: '18.5', trend: 2.0 }
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
      {metrics.map(metric => (
        <div key={metric.label} style={{
          backgroundColor: '#f9fafb',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid #10b981'
        }}>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>{metric.label}</p>
          <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>{metric.value}</h3>
          <p style={{
            fontSize: '12px',
            color: metric.trend > 0 ? '#059669' : '#dc2626'
          }}>
            {metric.trend > 0 ? '↑' : '↓'} {Math.abs(metric.trend).toFixed(1)}%
          </p>
        </div>
      ))}
    </div>
  )
}
