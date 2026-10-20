'use client'

import React, { useEffect, useRef, useState } from 'react'

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
  const containerRef = useRef<HTMLDivElement>(null)
  const [nodeCount, setNodeCount] = useState(4)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/profiles')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setNodeCount(data.meta?.total || 4)
        } else {
          setError(data.error)
        }
      })
      .catch(err => setError(err.message))
  }, [])

  useEffect(() => {
    if (containerRef.current) {
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

      containerRef.current.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #666;">
          <p>Galaxy Graph Visualization</p>
          <p style="font-size: 12px; color: #999;">
            Agents: ${nodeCount} | Base Nodes: ${nodes.length} | Links: ${links.length}
            ${error ? ` | Error: ${error}` : ''}
          </p>
        </div>
      `
    }
  }, [nodeCount, error])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
