'use client'

import React, { useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import dynamic from 'next/dynamic'

// Canvas library touches window; load it in the browser only.
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

type NodeType = 'person' | 'team' | 'agent'

interface GraphNode {
  id: string
  name: string
  type: NodeType
}

interface GraphLink {
  source: string
  target: string
}

interface Profile {
  name: string
  role?: string
}

const BASE_NODES: GraphNode[] = [
  { id: 'james', name: 'James Duran', type: 'person' },
  { id: 'eng', name: 'Engineering', type: 'team' },
  { id: 'growth', name: 'Growth', type: 'team' },
  { id: 'ops', name: 'Operations', type: 'team' },
]

const BASE_LINKS: GraphLink[] = [
  { source: 'james', target: 'eng' },
  { source: 'james', target: 'growth' },
  { source: 'james', target: 'ops' },
]

const NODE_COLORS: Record<NodeType, string> = { person: '#6366f1', team: '#10b981', agent: '#f59e0b' }
const NODE_SIZES: Record<NodeType, number> = { person: 9, team: 7, agent: 5 }

function teamForRole(role: string = ''): string {
  const r = role.toLowerCase()
  if (/(eng|dev|code|tech|qa|data)/.test(r)) return 'eng'
  if (/(market|sales|growth|seo|content)/.test(r)) return 'growth'
  return 'ops'
}

export function buildGraph(profiles: Profile[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const agents = profiles.map((p, i) => ({ id: `agent-${i}-${p.name}`, name: p.name, type: 'agent' as const, role: p.role }))
  return {
    nodes: [...BASE_NODES, ...agents.map(({ id, name, type }) => ({ id, name, type }))],
    links: [...BASE_LINKS, ...agents.map(a => ({ source: teamForRole(a.role), target: a.id }))],
  }
}

function useContainerSize(): [React.RefObject<HTMLDivElement | null>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width: Math.floor(width), height: Math.floor(height) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, size]
}

export function GalaxyGraph(): ReactNode {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [containerRef, size] = useContainerSize()

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/profiles', { signal: controller.signal })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('Failed to load agent data'))))
      .then(data => setProfiles(Array.isArray(data?.data) ? (data.data as Profile[]) : []))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message.slice(0, 100) : 'Failed to load agent data')
      })
    return () => controller.abort()
  }, [])

  const graph = useMemo(() => buildGraph(profiles), [profiles])

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 text-xs text-gray-500">
        <span>
          Agents: {profiles.length} | Base Nodes: {BASE_NODES.length} | Links: {graph.links.length}
        </span>
        <span className="flex gap-3">
          {(Object.keys(NODE_COLORS) as NodeType[]).map(t => (
            <span key={t} className="flex items-center gap-1 capitalize">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: NODE_COLORS[t] }} />
              {t}
            </span>
          ))}
        </span>
      </div>
      {error && <p className="pb-2 text-xs text-red-600">Error: {error}</p>}
      <div ref={containerRef} className="relative flex-1 overflow-hidden rounded-md bg-slate-50">
        {size.width > 0 && (
          <ForceGraph2D
            graphData={graph}
            width={size.width}
            height={size.height}
            cooldownTicks={120}
            linkColor={() => '#cbd5e1'}
            linkWidth={1.5}
            nodeRelSize={1}
            nodeCanvasObject={(node, ctx, scale) => {
              const n = node as GraphNode & { x?: number; y?: number }
              const r = NODE_SIZES[n.type]
              ctx.beginPath()
              ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI)
              ctx.fillStyle = NODE_COLORS[n.type]
              ctx.fill()
              const fontSize = Math.max(12 / scale, 3)
              ctx.font = `${fontSize}px sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'top'
              ctx.fillStyle = '#1f2937'
              ctx.fillText(n.name, n.x ?? 0, (n.y ?? 0) + r + 2)
            }}
            nodePointerAreaPaint={(node, color, ctx) => {
              const n = node as GraphNode & { x?: number; y?: number }
              ctx.fillStyle = color
              ctx.beginPath()
              ctx.arc(n.x ?? 0, n.y ?? 0, NODE_SIZES[n.type] + 2, 0, 2 * Math.PI)
              ctx.fill()
            }}
          />
        )}
      </div>
    </div>
  )
}
