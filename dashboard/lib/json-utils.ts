import { NextRequest, NextResponse } from 'next/server'

interface ParseResult {
  success: boolean
  body?: unknown
  error?: string
}

export async function parseRequestJson(request: NextRequest): Promise<ParseResult> {
  try {
    const body = await request.json()
    return { success: true, body }
  } catch (error) {
    return { success: false, error: 'Invalid JSON' }
  }
}

export function jsonParseErrorResponse(error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status: 400 })
}
