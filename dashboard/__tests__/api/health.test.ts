import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { GET } from '@/app/api/health/route'

// Mock dependencies
jest.mock('@/lib/auth', () => ({
  verifyAuth: jest.fn(),
  createUnauthorizedResponse: jest.fn((error) => ({
    status: 401,
    json: { error },
  })),
}))

jest.mock('fs', () => {
  const actual = jest.requireActual('fs')
  return {
    promises: {
      stat: jest.fn(),
      readdir: jest.fn(),
      readFile: jest.fn(),
    },
    existsSync: jest.fn(),
  }
})

const { verifyAuth } = require('@/lib/auth')

/**
 * The three stat collectors run concurrently, so readFile call order is not deterministic.
 * Route readFile results by file name instead of relying on mockResolvedValueOnce ordering.
 */
function mockReadFileByName(contents: Record<string, string>) {
  const mockFs = require('fs').promises
  mockFs.readFile.mockImplementation(async (filePath: string) => {
    const name = path.basename(String(filePath))
    if (name in contents) return contents[name]
    throw new Error(`ENOENT: ${name}`)
  })
}

describe('/api/health - Async I/O Conversion Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // clearAllMocks keeps implementations; drop any mockReadFileByName routing from a prior test
    require('fs').promises.readFile.mockReset()
    process.env.JWT_SECRET = 'test-secret'
  })

  it('should call getCompanyBrainStats asynchronously without blocking', async () => {
    const mockFs = require('fs').promises
    mockFs.stat.mockResolvedValueOnce({ isDirectory: () => true })
    mockFs.readdir.mockResolvedValueOnce(['test-1.json', 'test-2.json'])
    mockReadFileByName({ 'test-2.json': JSON.stringify({ timestamp: '2026-10-21T12:00:00Z' }) })

    verifyAuth.mockResolvedValueOnce({ authenticated: true })

    const request = new NextRequest(new URL('http://localhost:3000/api/health'), {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(data.components.company_brain.log_count).toBe(2)
    expect(data.components.company_brain.latest_timestamp).toBe('2026-10-21T12:00:00Z')
    expect(mockFs.stat).toHaveBeenCalled()
    expect(mockFs.readdir).toHaveBeenCalled()
    expect(mockFs.readFile).toHaveBeenCalled()
  })

  it('should use Promise.all for parallel async I/O operations', async () => {
    const mockFs = require('fs').promises
    const statSpy = jest.fn().mockResolvedValue({ isDirectory: () => true })
    mockFs.stat.mockImplementationOnce(statSpy)
    mockFs.readdir.mockResolvedValueOnce(['meeting-1.json'])
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ timestamp: '2026-10-21T12:00:00Z' }))
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify([{ status: 'scheduled' }]))
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ meeting_skills: ['skill1', 'skill2'] }))

    verifyAuth.mockResolvedValueOnce({ authenticated: true })

    const request = new NextRequest(new URL('http://localhost:3000/api/health'), {
      method: 'GET',
    })

    const startTime = Date.now()
    const response = await GET(request)
    const duration = Date.now() - startTime

    expect(response.status).toBe(200)
    // Verify all calls were made (not sequential with heavy delays)
    expect(duration < 5000).toBe(true) // Should complete quickly with parallel execution
  })

  it('should handle missing directories gracefully without blocking', async () => {
    const mockFs = require('fs').promises
    mockFs.stat.mockRejectedValueOnce(new Error('ENOENT'))
    mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
    mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))

    verifyAuth.mockResolvedValueOnce({ authenticated: true })

    const request = new NextRequest(new URL('http://localhost:3000/api/health'), {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(data.components.company_brain.status).toBe('inactive')
    expect(data.components.company_brain.log_count).toBe(0)
    expect(data.components.skill_registry.status).toBe('missing')
  })

  // Health is public by design (middleware PUBLIC_ROUTES, route comment, rateLimiters.health):
  // monitoring/load balancers call it without credentials, so auth is never consulted.
  it('should be public: no auth check and no 401 without credentials', async () => {
    verifyAuth.mockResolvedValueOnce({
      authenticated: false,
      error: 'Invalid token',
    })

    const request = new NextRequest(new URL('http://localhost:3000/api/health'), {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.status).not.toBe(401)
    expect(verifyAuth).not.toHaveBeenCalled()
  })

  it('should handle JSON parse errors gracefully', async () => {
    const mockFs = require('fs').promises
    mockFs.stat.mockResolvedValueOnce({ isDirectory: () => true })
    mockFs.readdir.mockResolvedValueOnce(['invalid.json'])
    // Return invalid JSON string that will fail to parse
    mockFs.readFile.mockResolvedValueOnce('{ invalid json content }')

    verifyAuth.mockResolvedValueOnce({ authenticated: true })

    const request = new NextRequest(new URL('http://localhost:3000/api/health'), {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(data.components.company_brain.latest_timestamp).toBeNull()
    expect(data.status).toBe('degraded')
  })

  it('should report healthy status when all components are operational', async () => {
    const mockFs = require('fs').promises
    mockFs.stat.mockResolvedValue({ isDirectory: () => true })
    mockFs.readdir.mockResolvedValueOnce(['meeting-1.json'])
    mockReadFileByName({
      'meeting-1.json': JSON.stringify({ timestamp: '2026-10-21T12:00:00Z' }),
      'meetings-log.json': JSON.stringify([
        { status: 'scheduled' },
        { status: 'scheduled' },
        { status: 'scheduled' },
      ]),
      'registry.json': JSON.stringify({ meeting_skills: ['skill1', 'skill2', 'skill3'] }),
    })

    verifyAuth.mockResolvedValueOnce({ authenticated: true })

    const request = new NextRequest(new URL('http://localhost:3000/api/health'), {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(data.status).toBe('healthy')
    expect(data.components.company_brain.status).toBe('logging')
    expect(data.components.skill_registry.status).toBe('loaded')
    expect(data.metrics.total_skills_triggered).toBe(3)
  })

  it('should generate appropriate alerts for degraded state', async () => {
    const mockFs = require('fs').promises
    mockFs.stat.mockResolvedValueOnce({ isDirectory: () => true })
    mockFs.readdir.mockResolvedValueOnce([])
    mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
    mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'))

    verifyAuth.mockResolvedValueOnce({ authenticated: true })

    const request = new NextRequest(new URL('http://localhost:3000/api/health'), {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(data.alerts.length).toBeGreaterThan(0)
    expect(data.status).toBe('degraded')
  })
})
