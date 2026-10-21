'use client'

import React, { useEffect, useState, ReactNode } from 'react'

interface Node {
  id: string
  name: string
  type: 'person' | 'team' | 'project'
}

interface Link {
  source: string
  target: string
}

interface ApiResponse {
  success: boolean
  error?: string
  meta?: {
    total?: number
  }
}

/**
 * Sanitizes error message to prevent XSS attacks.
 *
 * Defense Strategy:
 * 1. Type validation: only accept strings
 * 2. Length validation: prevent DoS via excessively long messages (256 char limit)
 * 3. Pattern-based sanitization: remove 5 categories of XSS patterns
 *    - HTML tags: <script>, <img>, etc.
 *    - JavaScript protocol: javascript:alert()
 *    - Event handlers: onerror=, onload=, etc.
 *    - Data URLs: data:text/html
 *    - VBScript: vbscript:
 *
 * Note: After sanitization, React JSX auto-escapes all text content,
 * providing defense-in-depth protection.
 */
function sanitizeErrorMessage(message: string): string {
  // Ensure we have a string
  if (typeof message !== 'string') {
    return 'Unknown error'
  }

  // Apply length limit first to prevent processing oversized input
  const maxLength = 256
  let result = message.slice(0, maxLength)

  // Define XSS patterns to remove
  const xssPatterns = [
    /<[^>]*>/g, // HTML tags
    /javascript:/gi, // javascript: protocol
    /on\w+\s*=/gi, // Event handlers (onload, onerror, onclick, etc.)
    /data:text\/html/gi, // data: URLs containing HTML
    /vbscript:/gi, // VBScript protocol
  ]

  // Apply all sanitization patterns
  result = xssPatterns.reduce((acc, pattern) => acc.replace(pattern, ''), result)

  // Return sanitized message, or fallback if empty
  return result.trim() || 'An error occurred'
}

/**
 * Safely extracts error message from various sources.
 *
 * XSS Prevention Strategy:
 * ✓ Never use innerHTML or dangerouslySetInnerHTML
 * ✓ Never use direct document.innerHTML DOM manipulation
 * ✓ React's JSX automatically escapes text content (prevents XSS)
 * ✓ Type validation: safely extract strings from Error objects
 * ✓ Length limits: prevent UI overflow attacks
 * ✓ Pattern-based sanitization: remove XSS attack vectors
 *
 * This function handles extraction and sanitization. Rendering is done by React,
 * which escapes all text content automatically (defense-in-depth).
 */
function getErrorMessage(error: unknown): string {
  let message = 'Unable to load agent data'

  // Safe extraction from Error instances
  if (error instanceof Error) {
    message = error.message
  }
  // Safe extraction from string types
  else if (typeof error === 'string') {
    message = error
  }
  // Safe extraction from objects with message property
  else if (error !== null && typeof error === 'object') {
    const obj = error as Record<string, unknown>
    if (typeof obj.message === 'string') {
      message = obj.message
    }
  }

  // Sanitize the extracted message before returning
  return sanitizeErrorMessage(message)
}

interface StatsDisplayProps {
  nodeCount: number
  totalNodes: number
  totalLinks: number
  error: string | null
}

/**
 * Displays statistics as text-only content using React's safe rendering.
 *
 * XSS Safety: React automatically escapes all text content in JSX.
 * This component never uses innerHTML or dangerouslySetInnerHTML.
 * All user-provided data (errors) are rendered as text, not HTML.
 */
function StatsDisplay({
  nodeCount,
  totalNodes,
  totalLinks,
  error,
}: StatsDisplayProps): ReactNode {
  const stats = `Agents: ${nodeCount} | Base Nodes: ${totalNodes} | Links: ${totalLinks}`

  return (
    <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>
      <p>Galaxy Graph Visualization</p>
      <p style={{ fontSize: 12, color: '#999' }}>
        {/* React escapes all text content—safe to render statistics */}
        {stats}
      </p>
      {error && (
        <p style={{ fontSize: 12, color: '#d32f2f', marginTop: 8 }}>
          {/* React escapes all text content—safe to render error state */}
          Error: {error}
        </p>
      )}
    </div>
  )
}

export function GalaxyGraph(): ReactNode {
  const [nodeCount, setNodeCount] = useState(4)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Static node definitions (no dynamic user-provided content)
  const nodes: Node[] = [
    { id: 'james', name: 'James Duran', type: 'person' },
    { id: 'eng', name: 'Engineering', type: 'team' },
    { id: 'growth', name: 'Growth', type: 'team' },
    { id: 'ops', name: 'Operations', type: 'team' },
  ]

  // Static link definitions
  const links: Link[] = [
    { source: 'james', target: 'eng' },
    { source: 'james', target: 'growth' },
    { source: 'james', target: 'ops' },
  ]

  useEffect(() => {
    // Use AbortController to clean up requests on unmount
    const controller = new AbortController()

    const fetchProfiles = async (): Promise<void> => {
      try {
        const response = await fetch('/api/profiles', { signal: controller.signal })

        if (!response.ok) {
          setError('Failed to load agent data')
          return
        }

        const data: ApiResponse = await response.json()

        if (data.success && data.meta?.total) {
          setNodeCount(data.meta.total)
          setError(null)
        } else if (data.error) {
          // Extract and truncate error, but let React handle rendering
          const errorMessage = getErrorMessage(data.error)
          setError(errorMessage)
        }
      } catch (err: unknown) {
        // Don't update state if request was aborted (component unmounted)
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }

        // Safe error extraction
        const errorMessage = getErrorMessage(err)
        setError(errorMessage)
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfiles()

    // Cleanup: cancel ongoing request on unmount to prevent state updates
    return (): void => {
      controller.abort()
    }
  }, [])

  if (isLoading) {
    return (
      <div style={{ width: '100%', height: '100%', padding: 20, textAlign: 'center', color: '#999' }}>
        <p>Loading galaxy graph...</p>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <StatsDisplay
        nodeCount={nodeCount}
        totalNodes={nodes.length}
        totalLinks={links.length}
        error={error}
      />
    </div>
  )
}
