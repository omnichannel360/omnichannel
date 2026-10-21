'use client'

import React, { useEffect, useState } from 'react'

interface Node {
  id: string
  name: string
  type: 'person' | 'team' | 'project'
}

interface Link {
  source: string
  target: string
}

export function GalaxyGraph() {
  const [nodeCount, setNodeCount] = useState(4)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/profiles')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setNodeCount(data.meta?.total || 4)
        } else {
          setError(typeof data.error === 'string' ? data.error : 'Unknown error')
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Request failed'))
  }, [])

  const nodes: Node[] = [
    { id: 'james', name: 'James Duran', type: 'person' },
    { id: 'eng', name: 'Engineering', type: 'team' },
    { id: 'growth', name: 'Growth', type: 'team' },
    { id: 'ops', name: 'Operations', type: 'team' },
  ]

  const links: Link[] = [
    { source: 'james', target: 'eng' },
    { source: 'james', target: 'growth' },
    { source: 'james', target: 'ops' },
  ]

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>
        <p>Galaxy Graph Visualization</p>
        <p style={{ fontSize: 12, color: '#999' }}>
          Agents: {nodeCount} | Base Nodes: {nodes.length} | Links: {links.length}
          {error ? ` | Error: ${error}` : ''}
        </p>
      </div>
    </div>
  )
}
