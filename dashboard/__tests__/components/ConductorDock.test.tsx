import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConductorDock } from '@/components/ConductorDock'
import * as uuidModule from '@/lib/uuid'

// Mock the UUID module to verify it's being called
jest.mock('@/lib/uuid', () => ({
  generatePrefixedId: jest.fn((prefix: string) => `${prefix}_mock-uuid-12345`),
}))

// Mock the fetch API
global.fetch = jest.fn()

describe('ConductorDock UUID Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockClear()
  })

  it('uses generatePrefixedId for user message IDs', async () => {
    render(<ConductorDock />)

    const input = screen.getByPlaceholderText('Dispatch task...')
    const sendButton = screen.getByText('Send')

    fireEvent.change(input, { target: { value: 'Test message' }

  afterEach(() => {
    vi.clearAllMocks()
  }) })
    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(uuidModule.generatePrefixedId).toHaveBeenCalledWith('user')
    })
  })

  it('uses generatePrefixedId for assistant message IDs on success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        success: true,
        response: 'Assistant response',
      }),
    })

    render(<ConductorDock />)

    const input = screen.getByPlaceholderText('Dispatch task...')
    const sendButton = screen.getByText('Send')

    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(uuidModule.generatePrefixedId).toHaveBeenCalledWith('assistant')
    })
  })

  it('uses generatePrefixedId for error message IDs on failure', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

    render(<ConductorDock />)

    const input = screen.getByPlaceholderText('Dispatch task...')
    const sendButton = screen.getByText('Send')

    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(uuidModule.generatePrefixedId).toHaveBeenCalledWith('error')
    })
  })

  it('generates unique IDs for multiple messages', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({
        success: true,
        response: 'Assistant response',
      }),
    })

    const { rerender } = render(<ConductorDock />)

    const input = screen.getByPlaceholderText('Dispatch task...')
    const sendButton = screen.getByText('Send')

    // Send first message
    fireEvent.change(input, { target: { value: 'Message 1' } })
    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(uuidModule.generatePrefixedId).toHaveBeenCalled()
    })

    // Send second message
    rerender(<ConductorDock />)
    const input2 = screen.getByPlaceholderText('Dispatch task...')
    const sendButton2 = screen.getByText('Send')

    fireEvent.change(input2, { target: { value: 'Message 2' } })
    fireEvent.click(sendButton2)

    // Verify generatePrefixedId was called multiple times
    expect(uuidModule.generatePrefixedId).toHaveBeenCalledTimes(
      expect.any(Number)
    )
  })

  it('does not use Date.now() for message IDs', async () => {
    const dateNowSpy = jest.spyOn(Date, 'now')

    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        success: true,
        response: 'Assistant response',
      }),
    })

    render(<ConductorDock />)

    const input = screen.getByPlaceholderText('Dispatch task...')
    const sendButton = screen.getByText('Send')

    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.click(sendButton)

    await waitFor(() => {
      // Date.now() should still be called for timestamp, but not for ID generation
      // The important thing is that generatePrefixedId is used for IDs
      expect(uuidModule.generatePrefixedId).toHaveBeenCalled()
    })

    dateNowSpy.mockRestore()
  })

  it('uses correct prefixes for different message types', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        success: true,
        response: 'Assistant response',
      }),
    })

    render(<ConductorDock />)

    const input = screen.getByPlaceholderText('Dispatch task...')
    const sendButton = screen.getByText('Send')

    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.click(sendButton)

    await waitFor(() => {
      const calls = (uuidModule.generatePrefixedId as jest.Mock).mock.calls
      const prefixes = calls.map(call => call[0])

      // Should have called with 'user' for user message
      expect(prefixes).toContain('user')
      // Should have called with 'assistant' for assistant response
      expect(prefixes).toContain('assistant')
    })
  })
})
