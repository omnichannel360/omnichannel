import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { verifyAuth, createUnauthorizedResponse } from '@/lib/auth'
import { atomicRead } from '@/lib/atomic-file-ops'
import { atomicReaddir } from '@/lib/atomic-dir-ops'
import { applyRateLimit } from '@/lib/api-rate-limit-middleware'
import { generateId } from '@/lib/validation'

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

interface MemoryData {
  id?: string
  timestamp?: string
  action?: string
  result?: string
  category?: string
}

const BRAIN_DIR = path.join(process.cwd(), '..', 'company-brain')

async function getHandler(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.authenticated) {
    return createUnauthorizedResponse(auth.error || 'Authentication required')
  }

  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)

    // FIX: Use atomicReaddir to prevent race condition
    // - Previous code: fs.stat() → fs.readdir() (race with mkdir/delete)
    // - Fixed code: atomicReaddir() holds lock during mkdir + readdir
    let files: string[] = []
    try {
      const allFiles = await atomicReaddir(BRAIN_DIR)
      files = allFiles.filter(f => f.endsWith('.json'))
    } catch {
      return NextResponse.json({
        success: true,
        data: {
          total_memories: 0,
          recent: [],
          categories: {},
        } as BrainResponse,
      })
    }

    const memories: Memory[] = []
    const categoryCount: Record<string, number> = {}
    const seenIds = new Set<string>()

    // Read files sequentially with atomic locks to prevent race conditions
    // and ensure consistent snapshots of individual memory records
    for (const file of files) {
      try {
        const data = await atomicRead<MemoryData[] | Record<string, unknown>>(path.join(BRAIN_DIR, file))
        if (Array.isArray(data)) {
          data.forEach((mem: MemoryData) => {
            const id = mem.id || generateId('memory')
            const cat = mem.category || 'general'

            // Prevent duplicate IDs from being counted twice
            if (!seenIds.has(id)) {
              seenIds.add(id)
              categoryCount[cat] = (categoryCount[cat] || 0) + 1

              if (!category || mem.category === category) {
                memories.push({
                  id,
                  timestamp: mem.timestamp || new Date().toISOString(),
                  action: mem.action || '',
                  result: mem.result || '',
                  category: cat,
                })
              }
            }
          })
        }
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error)
        console.error(`Failed to parse memory file ${file}:`, err)
      }
    }

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

export async function GET(request: NextRequest) {
  const rateLimitError = await applyRateLimit(request, 'brain')
  if (rateLimitError) return rateLimitError

  return getHandler(request)
}
