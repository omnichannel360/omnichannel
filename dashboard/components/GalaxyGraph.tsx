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

      const div = document.createElement('div')
      div.style.padding = '20px'
      div.style.textAlign = 'center'
      div.style.color = '#666'

      const title = document.createElement('p')
      title.textContent = 'Galaxy Graph Visualization'
      div.appendChild(title)

      const stats = document.createElement('p')
      stats.style.fontSize = '12px'
      stats.style.color = '#999'
      stats.textContent = `Agents: ${nodeCount} | Base Nodes: ${nodes.length} | Links: ${links.length}${
        error ? ` | Error: ${error}` : ''
      }`
      div.appendChild(stats)

      containerRef.current.innerHTML = ''
      containerRef.current.appendChild(div)
    }
  }, [nodeCount, error])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
