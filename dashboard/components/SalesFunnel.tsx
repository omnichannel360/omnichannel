'use client'

import React from 'react'
import { EmptyState } from './StatCard'

// /api/metrics exposes no sales or pipeline data yet; show that plainly instead of fabricated numbers.
export function SalesFunnel() {
  return (
    <EmptyState
      title="No sales pipeline data connected"
      detail="Connect a CRM or add sales metrics to /api/metrics to populate the funnel."
    />
  )
}
