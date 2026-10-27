import { NextRequest, NextResponse } from 'next/server'

interface ParseResult {
  success: boolean
  body?: unknown
  error?: string
}

export async function parseRequestJson(request: NextRequest): Promise<ParseResult> {
  // Reject non-JSON content types (if a Content-Type header is present)
  const contentType = request.headers.get('content-type')
  if (contentType && !contentType.toLowerCase().includes('application/json')) {
    return { success: false, error: 'Content-Type must be application/json' }
  }

  try {
    const body = await request.json()
    if (body === null) {
      return { success: false, error: 'Request body cannot be null' }
    }
    return { success: true, body }
  } catch (error) {
    // Check by name: request.json() may throw a SyntaxError from another realm
    const errorName = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined
    if (errorName === 'SyntaxError') {
      return { success: false, error: 'Invalid JSON syntax in request body' }
    }
    return { success: false, error: 'Failed to parse request body' }
  }
}

export function jsonParseErrorResponse(error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status: 400 })
}
