import { FinanceMetrics } from '@/components/FinanceMetrics'

export default function FinancePage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Finance & Metrics</h1>
      <p className="text-gray-600 mb-6">Revenue, costs, and profitability</p>

      <div className="bg-white rounded-lg shadow p-4">
        <FinanceMetrics />
      </div>
    </div>
  )
}
