'use client'

import React from 'react'

interface AgentDossierProps {
  agentId: string
}

export function AgentDossier({ agentId }: AgentDossierProps) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div>
          <h3 style={{ fontWeight: '600', marginBottom: '10px' }}>Agent Information</h3>
          <div style={{
            backgroundColor: '#f9fafb',
            padding: '15px',
            borderRadius: '6px',
            space: '10px'
          }}>
            <p><strong>ID:</strong> {agentId}</p>
            <p><strong>Type:</strong> AI Assistant</p>
            <p><strong>Status:</strong> Active</p>
            <p><strong>Created:</strong> 2026-01-15</p>
          </div>
        </div>

        <div>
          <h3 style={{ fontWeight: '600', marginBottom: '10px' }}>Performance</h3>
          <div style={{
            backgroundColor: '#f9fafb',
            padding: '15px',
            borderRadius: '6px'
          }}>
            <p><strong>Accuracy:</strong> 94.2%</p>
            <p><strong>Avg Response Time:</strong> 240ms</p>
            <p><strong>Total Tasks:</strong> 4,521</p>
            <p><strong>Success Rate:</strong> 98.7%</p>
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ fontWeight: '600', marginBottom: '10px' }}>Recent Activity</h3>
        <div style={{ backgroundColor: '#f9fafb', padding: '15px', borderRadius: '6px' }}>
          <p style={{ fontSize: '12px', color: '#666' }}>
            Last 5 tasks completed in past 24 hours. Average satisfaction: 4.8/5.0
          </p>
        </div>
      </div>
    </div>
  )
}
