/**
 * Write routes must refuse to overwrite a corrupted JSON data file.
 * Regression: a single POST replaced the whole dataset with [newItem]
 * (.specify/bugs/atomic-corrupt-file-overwrite).
 */
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { NextRequest } from 'next/server'
import { clearAllLocks } from '@/lib/file-lock'

// Bypass auth and rate limiting: this suite is about the data layer
jest.mock('@/lib/protected-route', () => ({
  protectRouteMulti: (handlers: Record<string, (req: unknown, ctx: unknown) => unknown>) =>
    Object.fromEntries(
      Object.entries(handlers).map(([method, handler]) => [
        method,
        (request: unknown) => handler(request, { userId: 'test-user', role: 'admin' }),
      ])
    ),
}))
jest.mock('@/lib/api-rate-limit-middleware', () => ({
  applyRateLimit: jest.fn().mockResolvedValue(null),
}))
const dispatchToGitHub = jest.fn()
jest.mock('@/lib/github-dispatch', () => ({
  dispatchToGitHub: (...args: unknown[]) => dispatchToGitHub(...args),
  isDispatchConfigured: () => false,
}))

type Handler = (request: NextRequest) => Promise<Response>
type RouteModule = { POST: Handler; GET: Handler }

const TORN = '[\n  { "id": "keep-1" },\n  { "id": "keep-2" },\n  { "id": "kee'

/** Load a route with process.cwd() pointed at a temp dir, so it uses <tmp>/data/*.json */
function loadRoute(cwd: string, modulePath: string): RouteModule {
  const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(cwd)
  let route: RouteModule | undefined
  try {
    jest.isolateModules(() => {
      route = require(modulePath) as RouteModule
    })
  } finally {
    cwdSpy.mockRestore()
  }
  if (!route) throw new Error(`Failed to load ${modulePath}`)
  return route
}

function post(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('write routes against a corrupted data file', () => {
  let tmpRoot: string
  let tmpCwd: string
  let dataDir: string

  beforeEach(async () => {
    clearAllLocks()
    dispatchToGitHub.mockReset().mockResolvedValue({ status: 'not_configured' })
    // cwd is <tmp>/dashboard so routes that write to ../company-brain stay inside tmpRoot
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corrupt-routes-'))
    tmpCwd = path.join(tmpRoot, 'dashboard')
    dataDir = path.join(tmpCwd, 'data')
    await fs.mkdir(dataDir, { recursive: true })
  })

  afterEach(async () => {
    clearAllLocks()
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  const request = (method: string, url: string, body?: unknown): NextRequest =>
    new NextRequest(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  it.each([
    ['PUT', { title: 'Renamed', status: 'done' }],
    ['DELETE', undefined],
  ])('kanban %s returns 500 and does not reseed or rewrite the board', async (method, body) => {
    const target = path.join(dataDir, 'kanban.json')
    await fs.writeFile(target, TORN, 'utf-8')
    const route = loadRoute(tmpCwd, '@/app/api/kanban/route') as unknown as Record<string, Handler>

    const response = await route[method](request(method, 'http://localhost/api/kanban?id=keep-1', body))

    expect(response.status).toBe(500)
    expect(await fs.readFile(target, 'utf-8')).toBe(TORN)
  })

  it('meetings POST returns 500, keeps the log and writes no brain record', async () => {
    const target = path.join(dataDir, 'meetings-log.json')
    await fs.writeFile(target, TORN, 'utf-8')
    const route = loadRoute(tmpCwd, '@/app/api/meetings/route')

    // logToBrain resolves ../company-brain from process.cwd() at call time: keep it inside tmpRoot
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpCwd)
    let response: Response
    try {
      response = await route.POST(post('http://localhost/api/meetings', { meeting_type: 'standup' }))
    } finally {
      cwdSpy.mockRestore()
    }

    expect(response.status).toBe(500)
    expect(await fs.readFile(target, 'utf-8')).toBe(TORN)
    await expect(fs.readdir(path.join(tmpRoot, 'company-brain', 'meetings'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('kanban POST refuses a well-formed but non-array file instead of replacing it with defaults', async () => {
    const target = path.join(dataDir, 'kanban.json')
    await fs.writeFile(target, '{"note":"not a task list"}', 'utf-8')
    const route = loadRoute(tmpCwd, '@/app/api/kanban/route')

    const response = await route.POST(post('http://localhost/api/kanban', { title: 'Ship fix', status: 'todo' }))

    expect(response.status).toBe(500)
    expect(await fs.readFile(target, 'utf-8')).toBe('{"note":"not a task list"}')
  })

  const backupsOf = async (name: string): Promise<string[]> =>
    (await fs.readdir(dataDir)).filter((f) => f.startsWith(`.${name}.corrupt-`))

  it.each([
    ['alerts', 'alerts.json', '@/app/api/alerts/route', { title: 'Disk', message: 'Disk usage high', severity: 'warning' }],
    ['kanban', 'kanban.json', '@/app/api/kanban/route', { title: 'Ship fix', status: 'todo' }],
    ['conductor', 'conductor-logs.json', '@/app/api/conductor/route', { message: 'review the dashboard' }],
  ])('%s POST returns 500, keeps the file byte-identical and backs it up', async (name, file, modulePath, body) => {
    const target = path.join(dataDir, file)
    await fs.writeFile(target, TORN, 'utf-8')
    const route = loadRoute(tmpCwd, modulePath)

    const response = await route.POST(post(`http://localhost/api/${name}`, body))

    expect(response.status).toBe(500)
    expect(await fs.readFile(target, 'utf-8')).toBe(TORN)
    expect(await backupsOf(file)).toHaveLength(1)
  })

  it('conductor refuses before dispatching to GitHub, so retries cannot create duplicate issues', async () => {
    await fs.writeFile(path.join(dataDir, 'conductor-logs.json'), TORN, 'utf-8')
    const route = loadRoute(tmpCwd, '@/app/api/conductor/route')

    const response = await route.POST(post('http://localhost/api/conductor', { message: 'deploy the build' }))

    expect(response.status).toBe(500)
    expect(dispatchToGitHub).not.toHaveBeenCalled()
  })

  it('conductor GET still reads a corrupted log as empty without modifying it', async () => {
    const target = path.join(dataDir, 'conductor-logs.json')
    await fs.writeFile(target, TORN, 'utf-8')
    const route = loadRoute(tmpCwd, '@/app/api/conductor/route')

    const response = await route.GET(new NextRequest('http://localhost/api/conductor'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual([])
    expect(await fs.readFile(target, 'utf-8')).toBe(TORN)
  })

  it('conductor keeps every entry under concurrent POSTs (single lock per append)', async () => {
    const route = loadRoute(tmpCwd, '@/app/api/conductor/route')
    const COUNT = 10

    const responses = await Promise.all(
      Array.from({ length: COUNT }, (_, i) =>
        route.POST(post('http://localhost/api/conductor', { message: `analyze report ${i}` }))
      )
    )

    expect(responses.map((r) => r.status)).toEqual(Array(COUNT).fill(200))
    const logs = JSON.parse(await fs.readFile(path.join(dataDir, 'conductor-logs.json'), 'utf-8'))
    expect(logs).toHaveLength(COUNT)
    expect(new Set(logs.map((l: { userMessage: string }) => l.userMessage)).size).toBe(COUNT)
  })
})
