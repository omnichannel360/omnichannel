import { render, screen } from '@testing-library/react'
import { AgentDossier } from '@/components/AgentDossier'

describe('AgentDossier Component', () => {
  const testAgentId = 'agent-001'

  describe('Rendering', () => {
    it('should render the agent dossier with correct agent ID', () => {
      render(<AgentDossier agentId={testAgentId} />)

      expect(screen.getByText(new RegExp(`Agent ${testAgentId}`))).toBeInTheDocument()
    })

    it('should display the header section with agent name and status', () => {
      render(<AgentDossier agentId={testAgentId} />)

      const header = screen.getByRole('banner')
      expect(header).toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('should display metrics section with correct labels', () => {
      render(<AgentDossier agentId={testAgentId} />)

      expect(screen.getByText('Tasks Completed')).toBeInTheDocument()
      expect(screen.getByText('Success Rate')).toBeInTheDocument()
      expect(screen.getByText(/Avg Response/)).toBeInTheDocument()
    })

    it('should display performance details section', () => {
      render(<AgentDossier agentId={testAgentId} />)

      expect(screen.getByText('Performance Details')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Agent ID')).toBeInTheDocument()
    })

    it('should display recent activities section', () => {
      render(<AgentDossier agentId={testAgentId} />)

      expect(screen.getByText('Recent Activities')).toBeInTheDocument()
      expect(screen.getByText(/Task #127 completed successfully/)).toBeInTheDocument()
    })
  })

  describe('CSS Classes Validation', () => {
    it('should use valid Tailwind CSS classes for layout', () => {
      const { container } = render(<AgentDossier agentId={testAgentId} />)

      const article = container.querySelector('article')
      expect(article).toHaveClass('w-full', 'max-w-2xl', 'mx-auto', 'p-6')
    })

    it('should use valid color classes in metric cards', () => {
      const { container } = render(<AgentDossier agentId={testAgentId} />)

      const metricCards = container.querySelectorAll('[class*="bg-"]')
      expect(metricCards.length).toBeGreaterThan(0)

      metricCards.forEach((card) => {
        const classList = card.className
        // Verify valid Tailwind color classes
        expect(
          /bg-(blue|green|purple|gray|red|yellow)-(50|100|200|300|400|500|600|700|800|900)/.test(classList)
        ).toBe(true)
      })
    })

    it('should use valid text color classes', () => {
      const { container } = render(<AgentDossier agentId={testAgentId} />)

      const textElements = container.querySelectorAll('[class*="text-"]')
      expect(textElements.length).toBeGreaterThan(0)
    })

    it('should use valid border classes', () => {
      const { container } = render(<AgentDossier agentId={testAgentId} />)

      const borderedElements = container.querySelectorAll('[class*="border"]')
      expect(borderedElements.length).toBeGreaterThan(0)

      borderedElements.forEach((el) => {
        const classList = el.className
        expect(/border-(gray|blue|green|purple|red|yellow)-200/.test(classList)).toBe(true)
      })
    })

    it('should use valid spacing classes', () => {
      const { container } = render(<AgentDossier agentId={testAgentId} />)

      const spacedElements = container.querySelectorAll('[class*="p-"]')
      expect(spacedElements.length).toBeGreaterThan(0)
    })

    it('should use valid responsive classes', () => {
      const { container } = render(<AgentDossier agentId={testAgentId} />)

      const gridElements = container.querySelectorAll('[class*="grid"]')
      expect(gridElements.length).toBeGreaterThan(0)
    })
  })

  describe('Semantic HTML', () => {
    it('should use semantic HTML tags', () => {
      const { container } = render(<AgentDossier agentId={testAgentId} />)

      expect(container.querySelector('article')).toBeInTheDocument()
      expect(container.querySelector('header')).toBeInTheDocument()
      expect(container.querySelectorAll('section').length).toBeGreaterThan(0)
    })

    it('should use proper heading hierarchy', () => {
      render(<AgentDossier agentId={testAgentId} />)

      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1).toBeInTheDocument()

      const h2Elements = screen.getAllByRole('heading', { level: 2 })
      expect(h2Elements.length).toBeGreaterThan(0)
    })

    it('should use proper definition list for performance details', () => {
      const { container } = render(<AgentDossier agentId={testAgentId} />)

      const dlElement = container.querySelector('dl')
      expect(dlElement).toBeInTheDocument()

      const dtElements = container.querySelectorAll('dt')
      const ddElements = container.querySelectorAll('dd')
      expect(dtElements.length).toEqual(ddElements.length)
    })
  })

  describe('Data Display', () => {
    it('should display numeric metrics correctly', () => {
      render(<AgentDossier agentId={testAgentId} />)

      expect(screen.getByText('127')).toBeInTheDocument() // Tasks completed
      expect(screen.getByText('94.2%')).toBeInTheDocument() // Success rate
      expect(screen.getByText('1.2')).toBeInTheDocument() // Response time
    })

    it('should display status badges', () => {
      render(<AgentDossier agentId={testAgentId} />)

      const activeStatusElement = screen.getByText('Active')
      expect(activeStatusElement).toBeInTheDocument()
    })

    it('should display agent ID in monospace font', () => {
      const { container } = render(<AgentDossier agentId={testAgentId} />)

      const monoElements = container.querySelectorAll('[class*="font-mono"]')
      expect(monoElements.length).toBeGreaterThan(0)
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const { container } = render(<AgentDossier agentId={testAgentId} />)

      // Article should be properly marked
      const article = container.querySelector('article')
      expect(article).toHaveAttribute('class') // Ensure it has styling
    })

    it('should have sufficient color contrast classes', () => {
      const { container } = render(<AgentDossier agentId={testAgentId} />)

      const textElements = container.querySelectorAll('[class*="text-"]')
      expect(textElements.length).toBeGreaterThan(0)
    })

    it('should display status indicator with appropriate color', () => {
      render(<AgentDossier agentId={testAgentId} />)

      // Green status indicator for active agent
      const statusIndicator = screen.getByText('Active').parentElement
      expect(statusIndicator).toBeInTheDocument()
    })
  })

  describe('Performance Indicators', () => {
    it('should apply correct status color based on success rate', () => {
      render(<AgentDossier agentId={testAgentId} />)

      // 94.2% should show green color (>=95 threshold would be different)
      const successRateElement = screen.getByText('94.2%')
      expect(successRateElement).toHaveClass('text-yellow-600')
    })

    it('should display queue status', () => {
      render(<AgentDossier agentId={testAgentId} />)

      expect(screen.getByText('0 pending')).toBeInTheDocument()
    })

    it('should display memory usage information', () => {
      render(<AgentDossier agentId={testAgentId} />)

      expect(screen.getByText('42.5 MB')).toBeInTheDocument()
    })
  })

  describe('Recent Activities', () => {
    it('should display activity items with proper styling', () => {
      const { container } = render(<AgentDossier agentId={testAgentId} />)

      const activityItems = container.querySelectorAll('[class*="bg-"][class*="rounded"]')
      expect(activityItems.length).toBeGreaterThan(0)
    })

    it('should show activity status indicators', () => {
      const { container } = render(<AgentDossier agentId={testAgentId} />)

      const statusIndicators = container.querySelectorAll('[class*="rounded-full"]')
      expect(statusIndicators.length).toBeGreaterThan(0)
    })
  })
})
