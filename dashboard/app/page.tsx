import { GalaxyGraph } from '@/components/GalaxyGraph'

export default function Home() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Galaxy Graph</h1>
      <p className="text-gray-600 mb-6">Organization structure and relationships</p>

      <div className="bg-white rounded-lg shadow p-4" style={{ height: '600px' }}>
        <GalaxyGraph />
      </div>
    </div>
  )
}
