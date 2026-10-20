import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

interface AgentProfile {
  name: string
  role: string
  email?: string
  status?: string
}

const PROFILES_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '', '.hermes', 'profiles')

export async function GET() {
  try {
    if (!fs.existsSync(PROFILES_DIR)) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0 },
      })
    }

    const entries = fs.readdirSync(PROFILES_DIR, { withFileTypes: true })
    const profiles: AgentProfile[] = entries
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        name: entry.name,
        role: inferRoleFromName(entry.name),
        status: 'active',
      }))

    return NextResponse.json({
      success: true,
      data: profiles,
      meta: { total: profiles.length },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to load profiles' },
      { status: 500 }
    )
  }
}

function inferRoleFromName(name: string): string {
  const parts = name.split('-')
  return parts
    .slice(0, -1)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}
