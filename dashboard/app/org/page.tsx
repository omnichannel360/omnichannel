import { OrgChart } from '@/components/OrgChart'

export default function OrgPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Organization Chart</h1>
      <p className="text-gray-600 mb-6">Team structure and reporting relationships</p>

      <div className="bg-white rounded-lg shadow p-4 overflow-auto" style={{ height: '600px' }}>
        <OrgChart />
      </div>
    </div>
  )
}
