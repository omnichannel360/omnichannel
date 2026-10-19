'use client'

import React from 'react'

interface Task {
  id: string
  title: string
  status: 'todo' | 'in-progress' | 'done'
}

export function KanbanBoard() {
  const tasks: Task[] = [
    { id: '1', title: 'Complete API design', status: 'done' },
    { id: '2', title: 'Implement authentication', status: 'in-progress' },
    { id: '3', title: 'Write tests', status: 'todo' },
  ]

  const columns = {
    'todo': tasks.filter(t => t.status === 'todo'),
    'in-progress': tasks.filter(t => t.status === 'in-progress'),
    'done': tasks.filter(t => t.status === 'done'),
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
      {Object.entries(columns).map(([status, items]) => (
        <div key={status} style={{ backgroundColor: '#f3f4f6', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ fontWeight: '600', marginBottom: '10px', textTransform: 'capitalize' }}>
            {status.replace('-', ' ')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {items.map(task => (
              <div
                key={task.id}
                style={{
                  backgroundColor: '#ffffff',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  cursor: 'move'
                }}
              >
                {task.title}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
