'use client'

import React, { useEffect, useState } from 'react'
import { StatCard, ErrorState } from './StatCard'

interface Finance {
  revenue: number
  costs: number
  profit_margin: number
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function FinanceMetrics() {
  const [finance, setFinance] = useState<Finance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.finance) {
          setFinance(data.data.finance as Finance)
        } else {
          setError(data.error || 'Finance metrics unavailable')
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Request failed'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-5 text-gray-500">Loading metrics...</div>
  if (error || !finance) return <ErrorState message={error || 'No data'} />

  const revenue = Number(finance.revenue) || 0
  const costs = Number(finance.costs) || 0
  const margin = Number(finance.profit_margin) || 0

  return (
    <div className="grid grid-cols-2 gap-4">
      <StatCard label="Revenue" value={usd.format(revenue)} />
      <StatCard label="Costs" value={usd.format(costs)} accent="#f59e0b" />
      <StatCard label="Profit" value={usd.format(revenue - costs)} accent="#3b82f6" />
      <StatCard label="Profit margin" value={`${(margin * 100).toFixed(1)}%`} accent="#8b5cf6" />
    </div>
  )
}
