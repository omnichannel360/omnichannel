import { SalesFunnel } from '@/components/SalesFunnel'

export default function FunnelPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Sales Funnel</h1>
      <p className="text-gray-600 mb-6">Pipeline and conversion metrics</p>

      <div className="bg-white rounded-lg shadow p-4">
        <SalesFunnel />
      </div>
    </div>
  )
}
