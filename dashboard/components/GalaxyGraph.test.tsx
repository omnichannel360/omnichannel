/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { GalaxyGraph } from './GalaxyGraph'

// The component reads /api/profiles ({ success, data: Profile[] }). Non-2xx
// responses show a fixed message; a rejected fetch shows the Error message
// (truncated to 100 chars) as React text, which is the only path by which
// arbitrary strings reach the DOM.

function expectNoInjectedElements(container: HTMLElement): void {
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('img')).toBeNull()
  expect(container.querySelector('[onclick], [onerror], [onload]')).toBeNull()
}

describe('GalaxyGraph XSS Prevention', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('HTML Injection Prevention', () => {
    test('should escape HTML tags in error messages', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockRejectedValueOnce(new Error('<img src=x onerror="alert(\'XSS\')" />'))

      const { container } = render(<GalaxyGraph />)

      await waitFor(() => {
        // Error text should contain the literal string, not execute HTML
        expect(screen.getByText(/Error: <img/)).toBeInTheDocument()
      })
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expectNoInjectedElements(container)
    })

    test('should escape script injection attempts', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockRejectedValueOnce(new Error('<script>alert("XSS")</script>'))

      const { container } = render(<GalaxyGraph />)

      await waitFor(() => {
        // The literal text IS shown
        expect(screen.getByText(/<script>/)).toBeInTheDocument()
      })
      // But no script element is created
      expectNoInjectedElements(container)
    })

    test('should escape event handler attributes', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockRejectedValueOnce(new Error('<div onclick="alert(\'XSS\')">Click</div>'))

      const { container } = render(<GalaxyGraph />)

      await waitFor(() => {
        // Text should be rendered, not executed as HTML
        expect(screen.getByText(/onclick=/)).toBeInTheDocument()
      })
      expectNoInjectedElements(container)
    })
  })

  describe('DOM Safety', () => {
    test('should never use innerHTML', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [{ name: '<div>x</div>', role: '<script>' }] }),
      })

      const { container } = render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Agents: 1 \|/)).toBeInTheDocument()
      })
      container.querySelectorAll('p, span').forEach(el => {
        // React escapes text; no raw tags should appear in markup
        expect(el.innerHTML).not.toContain('<div>')
        expect(el.innerHTML).not.toContain('<script>')
      })
      expectNoInjectedElements(container)
    })

    test('should render error as text content only', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockRejectedValueOnce(new Error('"><img src=x onerror=alert(1)>'))

      const { container } = render(<GalaxyGraph />)

      await waitFor(() => {
        // Should render as escaped text
        expect(screen.getByText(/"><img/)).toBeInTheDocument()
      })
      // Should not create actual img element
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expectNoInjectedElements(container)
    })
  })

  describe('Error Message Truncation', () => {
    test('should limit error message length to 100 characters', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockRejectedValueOnce(new Error('A'.repeat(300)))

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Error:/)).toBeInTheDocument()
      })
      expect(screen.getByText(/Error:/).textContent).toBe(`Error: ${'A'.repeat(100)}`)
    })
  })

  describe('Type Safety', () => {
    test('should handle Error objects safely', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'))

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Error: Network timeout/)).toBeInTheDocument()
      })
    })

    test('should show generic message for string rejections', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockRejectedValueOnce('Connection refused')

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Error: Failed to load agent data/)).toBeInTheDocument()
      })
      expect(screen.queryByText(/Connection refused/)).not.toBeInTheDocument()
    })

    test('should handle unknown error types gracefully', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockRejectedValueOnce(42) // Non-standard error

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Error: Failed to load agent data/)).toBeInTheDocument()
      })
    })

    test('should show generic message on non-2xx response', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, error: '<script>alert(1)</script>' }),
      })

      const { container } = render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Error: Failed to load agent data/)).toBeInTheDocument()
      })
      expect(screen.queryByText(/<script>/)).not.toBeInTheDocument()
      expectNoInjectedElements(container)
    })
  })

  describe('Statistics Rendering', () => {
    test('should display statistics safely without HTML injection', async () => {
      const profiles = Array.from({ length: 10 }, (_, i) => ({ name: `agent-${i}`, role: 'dev' }))
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: profiles }),
      })

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Agents: 10 \| Base Nodes: 4 \| Links: 13/)).toBeInTheDocument()
      })
    })
  })
})
