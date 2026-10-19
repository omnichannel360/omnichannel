import { KanbanBoard } from '@/components/KanbanBoard'

export default function BoardPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Kanban Board</h1>
      <p className="text-gray-600 mb-6">Project and task management</p>

      <div className="bg-white rounded-lg shadow p-4">
        <KanbanBoard />
      </div>
    </div>
  )
}
