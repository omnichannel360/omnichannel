import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OmniForge Dashboard',
  description: 'Company OS Dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex h-screen">
          <nav className="w-64 bg-gray-900 text-white p-4">
            <h1 className="text-2xl font-bold mb-8">OmniForge</h1>
            <ul className="space-y-4">
              <li><a href="/" className="hover:text-blue-400">Galaxy Graph</a></li>
              <li><a href="/board" className="hover:text-blue-400">Kanban Board</a></li>
              <li><a href="/org" className="hover:text-blue-400">Org Chart</a></li>
              <li><a href="/funnel" className="hover:text-blue-400">Sales Funnel</a></li>
              <li><a href="/finance" className="hover:text-blue-400">Finance</a></li>
              <li><a href="/delivery" className="hover:text-blue-400">Delivery</a></li>
              <li><a href="/meetings" className="hover:text-blue-400">Meetings</a></li>
            </ul>
          </nav>
          <main className="flex-1 bg-gray-50 overflow-auto">
            {children}
          </main>
          <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-auto">
            <h2 className="text-lg font-bold mb-4">Conductor Dock</h2>
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 rounded border border-blue-200">
                <p className="text-sm text-gray-600">Chat interface coming soon</p>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
