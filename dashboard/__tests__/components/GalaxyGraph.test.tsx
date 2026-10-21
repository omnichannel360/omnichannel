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

      render(<GalaxyGraph />)

      await waitFor(() => {
        const errorText = screen.getByText(/Error:/)
        expect(errorText).toBeInTheDocument()
        expect(screen.queryByText(/alert/)).not.toBeInTheDocument()
      })
    })

    it('should escape event handlers in error messages', async () => {
      const xssPayload = '<img src=x onerror="alert(1)">'
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error(xssPayload))

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.queryByRole('img')).not.toBeInTheDocument()
        expect(screen.getByText(/Error:/)).toBeInTheDocument()
      })
    })
  })

  describe('XSS Attack Prevention - JSON/Object Injection', () => {
    it('should handle API response with HTML in error field', async () => {
      const apiResponse = {
        success: false,
        error: '<img src=x onerror="alert(\'API XSS\')">'
      }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => apiResponse
      })

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.queryByRole('img')).not.toBeInTheDocument()
        expect(screen.getByText(/Error:/)).toBeInTheDocument()
      })
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
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({ success: true, meta: { total: 42 } })
      })

      render(<GalaxyGraph />)

      await waitFor(() => {
        expect(screen.getByText(/Agents: 42/)).toBeInTheDocument()
      })
    })
  })

  describe('Component Rendering', () => {
    it('should render the component with initial state', () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({ success: true, meta: { total: 4 } })
      })

      render(<GalaxyGraph />)

      expect(screen.getByText('Galaxy Graph Visualization')).toBeInTheDocument()
    })
  })
})
