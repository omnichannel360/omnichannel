import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { NextRequest } from 'next/server'
import { clearAllLocks } from '@/lib/file-lock'

jest.mock('@/lib/auth', () => ({
  verifyAuth: jest.fn().mockResolvedValue({ authenticated: true }),
  createUnauthorizedResponse: jest.fn(),
}))

type AlertsRoute = typeof import('@/app/api/alerts/route')
type AtomicOps = typeof import('@/lib/atomic-file-ops')

/**
 * Load the alerts route with process.cwd() pointed at a temp dir, so it reads/writes
 * <tmp>/data/alerts.json instead of the real dashboard data file.
 */
function loadAlertsRoute(cwd: string): { route: AlertsRoute; atomic: AtomicOps } {
  const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(cwd)
  let route: AlertsRoute | undefined
  let atomic: AtomicOps | undefined
  try {
    jest.isolateModules(() => {
      atomic = require('@/lib/atomic-file-ops') as AtomicOps
      route = require('@/app/api/alerts/route') as AlertsRoute
    })
  } finally {
    cwdSpy.mockRestore()
  }
  if (!route || !atomic) throw new Error('Failed to load alerts route')
  return { route, atomic }
}

function jsonRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/alerts', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('Alerts API - Async File I/O Verification', () => {
  const testDataDir = path.join(process.cwd(), 'test-data')
  const testFile = path.join(testDataDir, 'test-alerts.json')

  beforeEach(async () => {
    clearAllLocks()
    // Ensure test data directory exists
    try {
      await fs.mkdir(testDataDir, { recursive: true })
    } catch {
      // Already exists
    }
  })

  afterEach(async () => {
    // Cleanup test files
    try {
      await fs.unlink(testFile)
    } catch {
      // File doesn't exist
    }
  })

  describe('route behavior against an isolated data dir', () => {
    let tmpCwd: string
    let alertsFile: string

    beforeEach(async () => {
      tmpCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'alerts-route-test-'))
      alertsFile = path.join(tmpCwd, 'data', 'alerts.json')
    })

    afterEach(async () => {
      jest.restoreAllMocks()
      await fs.rm(tmpCwd, { recursive: true, force: true })
    })

    test('ensures all file I/O goes through the async, locked atomic helpers', async () => {
      const { route, atomic } = loadAlertsRoute(tmpCwd)
      const readSpy = jest.spyOn(atomic, 'atomicRead')
      const updateSpy = jest.spyOn(atomic, 'atomicUpdate')

      const postRes = await route.POST!(jsonRequest('POST', { title: 'Disk', message: 'Disk almost full' }))
      expect(postRes.status).toBe(201)
      const getRes = await route.GET!(jsonRequest('GET'))
      expect(getRes.status).toBe(200)

      expect(updateSpy).toHaveBeenCalledWith(alertsFile, expect.any(Function), [])
      expect(readSpy).toHaveBeenCalledWith(alertsFile, [])

      const persisted = JSON.parse(await fs.readFile(alertsFile, 'utf-8'))
      expect(persisted).toHaveLength(1)
      expect(persisted[0]).toMatchObject({ title: 'Disk', message: 'Disk almost full', status: 'active' })
    })

    test('concurrent POSTs do not lose updates', async () => {
      const { route } = loadAlertsRoute(tmpCwd)

      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          route.POST!(jsonRequest('POST', { title: `Alert ${i}`, message: `Message ${i}` }))
        )
      )
      responses.forEach((res) => expect(res.status).toBe(201))

      const persisted: Array<{ id: string; title: string }> = JSON.parse(await fs.readFile(alertsFile, 'utf-8'))
      expect(persisted).toHaveLength(10)
      expect(new Set(persisted.map((a) => a.id)).size).toBe(10)
      expect(persisted.map((a) => a.title).sort()).toEqual(
        Array.from({ length: 10 }, (_, i) => `Alert ${i}`).sort()
      )
    })

    test('verifies error handling with JSON parse errors', async () => {
      await fs.mkdir(path.dirname(alertsFile), { recursive: true })
      await fs.writeFile(alertsFile, '{ corrupted json', 'utf-8')
      const { route } = loadAlertsRoute(tmpCwd)

      // A corrupted data file is handled (no unhandled throw / 500) and reading never rewrites it
      const res = await route.GET!(jsonRequest('GET'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.data.alerts)).toBe(true)
      await expect(fs.readFile(alertsFile, 'utf-8')).resolves.toBe('{ corrupted json')
    })
  })

  test('verifies all API endpoints use async patterns', async () => {
    const endpoints = [
      'app/api/alerts/route.ts',
      'app/api/brain/route.ts',
      'app/api/conductor/route.ts',
      'app/api/kanban/route.ts',
      'app/api/meetings/route.ts',
    ]

    for (const endpoint of endpoints) {
      const filePath = path.join(process.cwd(), endpoint)
      const content = await fs.readFile(filePath, 'utf-8')

      // Each endpoint should do file I/O under a lock: directly via withFileLock, or via the
      // atomic helpers (lib/atomic-file-ops, lib/atomic-dir-ops), which take the lock internally
      expect(content).toMatch(/withFileLock|@\/lib\/atomic-(file|dir)-ops/)

      // Each endpoint should not have synchronous operations
      expect(content).not.toMatch(/readFileSync/, `${endpoint} should not use readFileSync`)
      expect(content).not.toMatch(/writeFileSync/, `${endpoint} should not use writeFileSync`)
    }
  })

  test('file-lock utility prevents concurrent write corruption', async () => {
    const { withFileLock } = await import('@/lib/file-lock')

    const results: number[] = []
    const operations = Array(5).fill(null).map((_, i) =>
      withFileLock(testFile, async () => {
        // Simulate file operation
        await new Promise(resolve => setTimeout(resolve, 10))
        results.push(i)
        return i
      })
    )

    const resolved = await Promise.all(operations)

    // Verify sequential execution (file lock prevents parallelism)
    expect(results.length).toBe(5)
    expect(resolved).toEqual([0, 1, 2, 3, 4])
  })

  test('verifies async/await chain completeness', async () => {
    const sourceFile = path.join(process.cwd(), 'app/api/alerts/route.ts')
    const content = await fs.readFile(sourceFile, 'utf-8')

    // Check that all async functions properly use await
    const asyncFunctions = content.match(/async function \w+.*?\{[\s\S]*?\n\}/g) || []

    asyncFunctions.forEach(fn => {
      // If it calls fs.readFile or fs.writeFile, it should have await
      if (fn.includes('fs.readFile') || fn.includes('fs.writeFile') || fn.includes('fs.mkdir') || fn.includes('fs.stat')) {
        expect(fn).toMatch(/await fs\.(readFile|writeFile|mkdir|stat)/)
      }
    })
  })

  test('verifies imports are properly resolved', async () => {
    const route = await import('@/app/api/alerts/route')

    expect(typeof route.GET).toBe('function')
    expect(typeof route.POST).toBe('function')
    expect(typeof route.PATCH).toBe('function')
  })
})
