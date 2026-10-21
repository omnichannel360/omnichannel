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

/**
 * Sanitizes error messages to prevent XSS attacks.
 * Removes any HTML-like content and truncates excessively long messages.
 */
function sanitizeErrorMessage(message: unknown): string {
  // Type validation
  if (typeof message !== 'string') {
    return 'Unknown error'
  }

  // Truncate to prevent overflow
  const maxLength = 100
  const truncated = message.slice(0, maxLength)

  // Remove any potential HTML/script content
  return truncated
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim()
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
          // Sanitize error before storing in state
          const sanitized = sanitizeErrorMessage(data.error)
          setError(sanitized)
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Request failed'
        setError(sanitizeErrorMessage(message))
      })
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

  // Build stats message using safe string concatenation
  const statsMessage = `Agents: ${nodeCount} | Base Nodes: ${nodes.length} | Links: ${links.length}`
  const fullMessage = error ? `${statsMessage} | Error: ${error}` : statsMessage

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>
        <p>Galaxy Graph Visualization</p>
        <p style={{ fontSize: 12, color: '#999' }}>
          {fullMessage}
        </p>
      </div>
    </div>
  )
}
