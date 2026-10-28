/**
 * Each request must count once against its endpoint's rate limit.
 * Regression: protectRoute applied the limiter via rateLimitKey and the handler
 * applied it again, so users were throttled at half the configured limit.
 */
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'

type Handler = (request: NextRequest) => Promise<Response>

const TEST_JWT_SECRET = 'test-secret-rate-limit-single-count'

function loadRoute(modulePath: string): Record<string, Handler> {
  let route: Record<string, Handler> | undefined
  jest.isolateModules(() => {
    route = require(modulePath) as Record<string, Handler>
  })
  if (!route) throw new Error(`Failed to load ${modulePath}`)
  return route
}

describe('rate limit counts each request once', () => {
  const originalSecret = process.env.JWT_SECRET
  let tmpRoot: string
  let cwdSpy: jest.SpyInstance

  beforeEach(async () => {
    process.env.JWT_SECRET = TEST_JWT_SECRET
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rl-single-'))
    const tmpCwd = path.join(tmpRoot, 'dashboard')
    await fs.mkdir(path.join(tmpCwd, 'data'), { recursive: true })
    // Keep every data-file access inside the temp dir for the whole test
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpCwd)
  })

  afterEach(async () => {
    cwdSpy.mockRestore()
    process.env.JWT_SECRET = originalSecret
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  it.each([
    ['meetings', '@/app/api/meetings/route', 50],
    ['alerts', '@/app/api/alerts/route', 50],
    ['conductor', '@/app/api/conductor/route', 50],
    ['kanban', '@/app/api/kanban/route', 100],
    ['brain', '@/app/api/brain/route', 10],
  ])('%s GET allows exactly its configured limit (%s, %i/min)', async (name, modulePath, limit) => {
    const route = loadRoute(modulePath)
    const token = jwt.sign({ sub: 'user-1', email: 'u@example.com', role: 'admin' }, TEST_JWT_SECRET, {
      expiresIn: '1h',
    })
    const request = (): NextRequest =>
      new NextRequest(`http://localhost/api/${name}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '203.0.113.7' },
      })

    const statuses: number[] = []
    for (let i = 0; i < limit; i++) {
      statuses.push((await route.GET(request())).status)
    }
    const overLimit = await route.GET(request())

    expect(statuses.filter((s) => s === 429)).toHaveLength(0)
    expect(overLimit.status).toBe(429)
  })
})
