'use client'

import React, { useEffect, useState } from 'react'

interface Person {
  id: string
  name: string
  role: string
  reports?: Person[]
}

export function OrgChart() {
  const [org, setOrg] = useState<Person | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/profiles')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setOrg({
            id: 'james',
            name: 'James Duran',
            role: 'Founder & CTO',
            reports: data.data.slice(0, 5).map((p: any) => ({
              id: p.name,
              name: p.name,
              role: p.role || 'Agent',
              reports: []
            }))
          })
        } else {
          setError(data.error)
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '20px' }}>Loading org chart...</div>
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>
  if (!org) return <div style={{ padding: '20px' }}>No org data</div>

  const renderPerson = (person: Person, depth = 0) => (
    <div key={person.id} style={{ marginLeft: `${depth * 20}px`, marginBottom: '10px' }}>
      <div style={{
        backgroundColor: '#e0e7ff',
        padding: '10px',
        borderRadius: '6px',
        borderLeft: '3px solid #4f46e5',
        marginBottom: '5px'
      }}>
        <strong>{person.name}</strong>
        <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{person.role}</p>
      </div>
      {person.reports?.map(report => renderPerson(report, depth + 1))}
    </div>
  )

  return (
    <div>
      {renderPerson(org)}
    </div>
  )
}
