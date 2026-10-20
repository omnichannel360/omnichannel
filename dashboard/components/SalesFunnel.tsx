'use client'

import React, { useEffect, useState } from 'react'

interface FunnelStage {
  name: string
  count: number
}

export function SalesFunnel() {
  const [stages, setStages] = useState<FunnelStage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.sales) {
          const sales = data.data.sales
          setStages([
            { name: 'Leads', count: 1000 },
            { name: 'Qualified', count: 500 },
            { name: 'Proposal', count: 200 },
            { name: 'Closed', count: Math.round(sales.pipeline_value / sales.average_deal_size * 0.05) }
          ])
        } else {
          setError(data.error)
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '20px' }}>Loading...</div>
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>

  const maxCount = Math.max(...stages.map(s => s.count))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      {stages.map((stage, idx) => {
        const width = (stage.count / maxCount) * 100
        const conversionRate = idx === 0 ? '100%' : `${((stage.count / stages[idx - 1].count) * 100).toFixed(1)}%`

        return (
          <div key={stage.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontWeight: '500' }}>{stage.name}</span>
              <span style={{ fontSize: '12px', color: '#666' }}>
                {stage.count} ({conversionRate})
              </span>
            </div>
            <div style={{
              backgroundColor: '#f3f4f6',
              borderRadius: '4px',
              overflow: 'hidden',
              height: '30px'
            }}>
              <div style={{
                width: `${width}%`,
                backgroundColor: '#3b82f6',
                height: '100%',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
