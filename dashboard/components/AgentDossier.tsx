'use client'

export function AgentDossier({ agentId }: { agentId: string }) {
  return (
    <div className="p-4">
      <h2>Agent {agentId}</h2>
      <p>Agent dossier component</p>
    </div>
  )
}
