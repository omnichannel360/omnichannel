import { DeptDossier } from '@/components/DeptDossier'

interface DeptPageProps {
  params: { id: string }
}

export default function DeptPage({ params }: DeptPageProps) {
  const { id } = params

  return (
    <div className="p-6">
      <div className="mb-4">
        <a href="/" className="text-blue-600 hover:underline">← Back</a>
      </div>

      <h1 className="text-3xl font-bold mb-4">Department Overview</h1>

      <div className="bg-white rounded-lg shadow p-4">
        <DeptDossier deptId={id} />
      </div>
    </div>
  )
}
