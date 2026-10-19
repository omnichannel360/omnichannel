'use client'

import React from 'react'

interface Person {
  id: string
  name: string
  role: string
  reports?: Person[]
}

export function OrgChart() {
  const org: Person = {
    id: 'james',
    name: 'James Duran',
    role: 'Founder & CTO',
    reports: [
      {
        id: 'eng-lead',
        name: 'Engineering Lead',
        role: 'Engineering',
        reports: []
      },
      {
        id: 'growth-lead',
        name: 'Growth Lead',
        role: 'Growth',
        reports: []
      }
    ]
  }

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
