import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'

interface Memory {
  id: string
  timestamp: string
  action: string
  result: string
  category: string
}

interface BrainResponse {
  total_memories: number
  recent: Memory[]
  categories: Record<string, number>
}

const BRAIN_DIR = path.join(process.cwd(), '..', 'company-brain')

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    if (!fs.existsSync(BRAIN_DIR)) {
      return NextResponse.json({
        success: true,
        data: {
          total_memories: 0,
          recent: [],
          categories: {},
        } as BrainResponse,
      })
    }

    const files = fs.readdirSync(BRAIN_DIR).filter(f => f.endsWith('.json'))
    const memories: Memory[] = []
    const categoryCount: Record<string, number> = {}

    files.forEach(file => {
      try {
        const content = fs.readFileSync(path.join(BRAIN_DIR, file), 'utf-8')
        const data = JSON.parse(content)

        if (Array.isArray(data)) {
          data.forEach((mem: any) => {
            const cat = mem.category || 'general'
            categoryCount[cat] = (categoryCount[cat] || 0) + 1

            if (!category || mem.category === category) {
              memories.push({
                id: mem.id || randomUUID(),
                timestamp: mem.timestamp || new Date().toISOString(),
                action: mem.action || '',
                result: mem.result || '',
                category: cat,
              })
            }
          })
        }
      } catch (e) {
        // Skip malformed files
      }
    })

    const recent = memories.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ).slice(0, limit)

    return NextResponse.json({
      success: true,
      data: {
        total_memories: memories.length,
        recent,
        categories: categoryCount,
      } as BrainResponse,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to query brain' },
      { status: 500 }
    )
  }
}
