import { AgentDossier } from '@/components/AgentDossier'

interface AgentPageProps {
  params: Promise<{ id: string }>
}

export default async function AgentPage({ params }: AgentPageProps) {
  const { id } = await params

  return (
    <div className="p-6">
      <div className="mb-4">
        <a href="/" className="text-blue-600 hover:underline">← Back</a>
      </div>

      <h1 className="text-3xl font-bold mb-4">Agent Dossier</h1>

      <div className="bg-white rounded-lg shadow p-4">
        <AgentDossier agentId={id} />
      </div>
    </div>
  )
}
