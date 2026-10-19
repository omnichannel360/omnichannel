import { DeliveryMetrics } from '@/components/DeliveryMetrics'

export default function DeliveryPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Delivery & Performance</h1>
      <p className="text-gray-600 mb-6">Project timelines and team velocity</p>

      <div className="bg-white rounded-lg shadow p-4">
        <DeliveryMetrics />
      </div>
    </div>
  )
}
