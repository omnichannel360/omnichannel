/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { GalaxyGraph } from './GalaxyGraph'

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: '<img src=x onerror="alert(\'XSS\')" />',
        }),
      })

      render(<GalaxyGraph />)

      await waitFor(() => {
        // Error text should contain the literal string, not execute HTML
        expect(screen.getByText(/Error: <img/)).toBeInTheDocument()
        // The script should NOT be executed
        expect(screen.queryByRole('img')).not.toBeInTheDocument()
      })
    })

    test('should escape script injection attempts', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: '<script>alert("XSS")</script>',
        }),
      })

      render(<GalaxyGraph />)

      await waitFor(() => {
        // Verify script tag is NOT rendered as HTML
        expect(document.querySelector('script')).not.toBeInTheDocument()
        // But the literal text IS shown
        expect(screen.getByText(/<script>/)).toBeInTheDocument()
      })
    })

    test('should escape event handler attributes', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: '<div onclick="alert(\'XSS\')">Click</div>',
        }),
      })

      render(<GalaxyGraph />)

      await waitFor(() => {
        // Text should be rendered, not executed as HTML
        expect(screen.getByText(/onclick=/)).toBeInTheDocument()
      })
    })
  })

  describe('DOM Safety', () => {
    test('should never use innerHTML', () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          meta: { total: 4 },
        }),
      })

      const { container } = render(<GalaxyGraph />)
      
      // Check that component doesn't use innerHTML for rendering user data
      const errorElements = container.querySelectorAll('p')
      errorElements.forEach(el => {
        // innerHTML should not contain actual HTML tags (React escapes)
        expect(el.innerHTML).not.toContain('<div>')
        expect(el.innerHTML).not.toContain('<script>')
      })
    })

    test('should render error as text content only', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: '"><img src=x onerror=alert(1)>',
        }),
      })

      render(<GalaxyGraph />)

      await waitFor(() => {
        // Should render as escaped text
        expect(screen.getByText(/"><img/)).toBeInTheDocument()
        // Should not create actual img element
        expect(screen.queryByRole('img')).not.toBeInTheDocument()
      })
    })
  })

  describe('Error Message Truncation', () => {
    test('should limit error message length to 256 characters', async () => {
      const mockFetch = global.fetch as jest.Mock
      const longMessage = 'A'.repeat(300)
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: longMessage,
        }),
      })

      render(<GalaxyGraph />)

      await waitFor(() => {
        const errorElement = screen.getByText(/Error:/)
        const errorText = errorElement.textContent
        // Message should be truncated: "Error: " (7 chars) + 256 chars max
        expect(errorText!.length).toBeLessThanOrEqual('Error: '.length + 256)
      })
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

    test('should handle string errors safely', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockRejectedValueOnce('Connection refused')

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Error: Connection refused/)).toBeInTheDocument()
      })
    })

    test('should handle unknown error types gracefully', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockRejectedValueOnce(42) // Non-standard error

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Error: Unable to load agent data/)).toBeInTheDocument()
      })
    })
  })

  describe('Statistics Rendering', () => {
    test('should display statistics safely without HTML injection', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          meta: { total: 10 },
        }),
      })

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Agents: 10 \| Base Nodes: 4 \| Links: 3/)).toBeInTheDocument()
      })
    })
  })
})
