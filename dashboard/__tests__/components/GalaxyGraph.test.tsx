/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { GalaxyGraph } from '../../components/GalaxyGraph'

// Mock fetch API
global.fetch = jest.fn()

describe('GalaxyGraph - XSS Vulnerability Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('XSS Attack Prevention - Direct Script Injection', () => {
    it('should escape HTML tags in error messages', async () => {
      const xssPayload = '<script>alert("XSS")</script>'
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error(xssPayload))

      const { container } = render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Error:/)).toBeInTheDocument()
      })
      // Payload is shown only as escaped text; no script element is created
      expect(screen.getByText(/Error:/).textContent).toBe(`Error: ${xssPayload}`)
      expect(container.querySelector('script')).toBeNull()
    })

    it('should escape event handlers in error messages', async () => {
      const xssPayload = '<img src=x onerror="alert(1)">'
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error(xssPayload))

      const { container } = render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Error:/)).toBeInTheDocument()
      })
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(container.querySelector('[onerror]')).toBeNull()
    })
  })

  describe('XSS Attack Prevention - JSON/Object Injection', () => {
    it('should handle API response with HTML in error field', async () => {
      const apiResponse = {
        success: false,
        error: '<img src=x onerror="alert(\'API XSS\')">'
      }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => apiResponse
      })

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Error:/)).toBeInTheDocument()
      })
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })
  })

  describe('Safe Error Message Handling', () => {
    it('should display safe error message on fetch failure', async () => {
      const errorMessage = 'Network request failed'
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error(errorMessage))

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(new RegExp(errorMessage))).toBeInTheDocument()
      })
    })

    it('should display success state with node counts', async () => {
      const profiles = Array.from({ length: 42 }, (_, i) => ({ name: `agent-${i}` }))
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: profiles })
      })

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Agents: 42/)).toBeInTheDocument()
      })
    })
  })

  describe('Component Rendering', () => {
    it('should render the component with initial state', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] })
      })

      render(<GalaxyGraph />)

      // Page heading lives in app/page.tsx; the component renders the stats bar and legend
      expect(screen.getByText(/Agents: 0 \| Base Nodes: 4 \| Links: 3/)).toBeInTheDocument()
      expect(screen.getByText('agent')).toBeInTheDocument()
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/profiles', expect.anything()))
    })
  })
})
