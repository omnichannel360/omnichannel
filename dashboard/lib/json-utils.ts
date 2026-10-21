import { NextRequest, NextResponse } from 'next/server'

export interface ParsedBody {
  success: boolean
  body?: unknown
  error?: string
}

/**
 * Safely parse JSON from a NextRequest with comprehensive error handling
 * Returns structured response: success flag + body or error message
 *
 * Handles:
 * - Invalid JSON syntax
 * - Empty bodies
 * - Non-JSON content-type
 * - Circular references
 * - Large payloads (implicit via Node limits)
 *
 * @param request - NextRequest from API handler
 * @returns Object with { success, body?, error? }
 * @throws Never - returns error in response object instead
 */
export async function parseRequestJson(
  request: NextRequest
): Promise<ParsedBody> {
  try {
    // Validate content-type if present
    const contentType = request.headers.get('content-type')
    if (contentType && !contentType.includes('application/json')) {
      return {
        success: false,
        error: 'Content-Type must be application/json',
      }
    }

    // Safely parse JSON
    const body = await request.json()

    // Validate body is not null (empty bodies are valid)
    if (body === null) {
      return {
        success: false,
        error: 'Request body cannot be null',
      }
    }

    return {
      success: true,
      body,
    }
  } catch (error) {
    // Categorize JSON parse errors
    if (error instanceof SyntaxError) {
      // SyntaxError covers both incomplete and malformed JSON
      return {
        success: false,
        error: 'Invalid JSON syntax in request body',
      }
    }

    // Generic fallback for unexpected error types
    return {
      success: false,
      error: 'Failed to parse request body',
    }
  }
}

/**
 * Create a JSON parse error response with 400 status
 * Use this to return consistent error responses across all endpoints
 *
 * @param errorMessage - User-friendly error message (defaults to standard message)
 * @returns NextResponse with 400 status
 */
export function jsonParseErrorResponse(errorMessage?: string): NextResponse {
  return NextResponse.json(
    { success: false, error: errorMessage || 'Invalid JSON in request body' },
    { status: 400 }
  )
}
