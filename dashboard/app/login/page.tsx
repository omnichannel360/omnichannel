'use client'

import { useState, type FormEvent } from 'react'

const card: React.CSSProperties = {
  maxWidth: 380,
  margin: '12vh auto 0',
  padding: 32,
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
}
const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  marginTop: 6,
  marginBottom: 16,
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 14,
}
const button: React.CSSProperties = {
  width: '100%',
  padding: '11px 12px',
  background: '#111827',
  color: '#fff',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
}

function safeNextPath(): string {
  const next = new URLSearchParams(window.location.search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        window.location.assign(safeNextPath())
        return
      }
      setError(res.status === 429 ? 'Too many attempts. Try again in a minute.' : 'Invalid email or password.')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={card}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>OmniForge</h1>
      <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>Sign in to the dashboard</p>
      <form onSubmit={onSubmit}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>
          Email
          <input style={input} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600 }}>
          Password
          <input style={input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p role="alert" style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>
            {error}
          </p>
        )}
        <button style={{ ...button, opacity: loading ? 0.6 : 1 }} type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
