'use client'

import React, { useEffect, useRef } from 'react'

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

  useEffect(() => {
    // Placeholder for react-force-graph-2d integration
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

      // This will be populated with actual react-force-graph-2d
      containerRef.current.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #666;">
          <p>Galaxy Graph Visualization</p>
          <p style="font-size: 12px; color: #999;">Nodes: ${nodes.length} | Links: ${links.length}</p>
        </div>
      `
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
