interface StatCardProps {
  label: string
  value: string
  hint?: string
  accent?: string
}

export function StatCard({ label, value, hint, accent = '#10b981' }: StatCardProps) {
  return (
    <div className="rounded-lg bg-gray-50 p-4" style={{ borderLeft: `4px solid ${accent}` }}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="p-8 text-center">
      <p className="font-medium text-gray-700">{title}</p>
      <p className="text-sm text-gray-500 mt-1">{detail}</p>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return <div className="p-5 text-red-600">Error: {message}</div>
}
