'use client'

import React, { useEffect, useState } from 'react'

interface Metric {
  label: string
  value: string
  trend: number
}

export function FinanceMetrics() {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.finance) {
          const fin = data.data.finance
          setMetrics([
            { label: 'Revenue', value: `$${(fin.revenue / 1000).toFixed(0)}k`, trend: 12.5 },
            { label: 'Expenses', value: `$${(fin.expenses / 1000).toFixed(0)}k`, trend: -8.2 },
            { label: 'Profit', value: `$${(fin.profit / 1000).toFixed(0)}k`, trend: 3.1 },
            { label: 'Burn Rate', value: `${fin.burn_rate.toFixed(1)}%`, trend: 2.0 }
          ])
        } else {
          setError(data.error)
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading metrics...</div>
  }

  if (error) {
    return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>
  }

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
