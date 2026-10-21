import { generateId, generateUUID } from './validation'

describe('validation.generateId', () => {
  it('generates unprefixed UUID v4 when no prefix provided', () => {
    const id = generateId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(id.split('-').length).toBe(5)
  })

  it('generates prefixed UUID v4 when prefix provided', () => {
    const id = generateId('meeting')
    expect(id).toMatch(/^meeting_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(id).toStartWith('meeting_')
  })

  it('generates unique IDs on successive calls', () => {
    const id1 = generateId('alert')
    const id2 = generateId('alert')
    expect(id1).not.toBe(id2)
  })

  it('generates 1000 unique unprefixed IDs without collisions', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId())
    }
    expect(ids.size).toBe(1000)
  })

  it('generates 1000 unique prefixed IDs without collisions', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId('task'))
    }
    expect(ids.size).toBe(1000)
  })

  it('handles multiple prefixes independently', () => {
    const meetingId = generateId('meeting')
    const alertId = generateId('alert')
    const taskId = generateId('task')

    expect(meetingId).toStartWith('meeting_')
    expect(alertId).toStartWith('alert_')
    expect(taskId).toStartWith('task_')
    expect(new Set([meetingId, alertId, taskId]).size).toBe(3)
  })

  it('maintains backwards compatibility with validateId calls', () => {
    const id = generateId('meeting')
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThanOrEqual(20) // "meeting" + "_" + UUID minimum
    expect(id.length).toBeLessThanOrEqual(100)   // reasonable maximum
    expect(id).toContain('_')
    expect(id).toContain('-')
  })

  it('works with empty string prefix', () => {
    const id = generateId('')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('works with special characters in prefix', () => {
    const id = generateId('user-message')
    expect(id).toStartWith('user-message_')
  })
})

describe('validation.generateUUID', () => {
  it('generates RFC 4122 v4 compliant UUID', () => {
    const uuid = generateUUID()
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('generates unique UUIDs on successive calls', () => {
    const uuid1 = generateUUID()
    const uuid2 = generateUUID()
    expect(uuid1).not.toBe(uuid2)
  })

  it('always returns 36 character string', () => {
    for (let i = 0; i < 10; i++) {
      expect(generateUUID().length).toBe(36)
    }
  })

  it('generates 5000 unique UUIDs without collisions', () => {
    const uuids = new Set<string>()
    for (let i = 0; i < 5000; i++) {
      uuids.add(generateUUID())
    }
    expect(uuids.size).toBe(5000)
  })

  it('has proper UUID v4 structure', () => {
    const uuid = generateUUID()
    const parts = uuid.split('-')
    expect(parts.length).toBe(5)
    expect(parts[0].length).toBe(8)
    expect(parts[1].length).toBe(4)
    expect(parts[2].length).toBe(4)
    expect(parts[3].length).toBe(4)
    expect(parts[4].length).toBe(12)
  })
})

describe('API ID generation patterns', () => {
  it('supports meeting API pattern: generateId("meeting")', () => {
    const id = generateId('meeting')
    expect(id).toMatch(/^meeting_/)
    expect(id).toContain('-')
  })

  it('supports alert API pattern: generateId("alert")', () => {
    const id = generateId('alert')
    expect(id).toMatch(/^alert_/)
    expect(id).toContain('-')
  })

  it('supports ConductorDock pattern: generateId("user")', () => {
    const id = generateId('user')
    expect(id).toMatch(/^user_/)
    expect(id).toContain('-')
  })

  it('generates unique IDs in rapid succession for concurrent operations', async () => {
    const ids = await Promise.all(
      Array.from({ length: 100 }, () => Promise.resolve(generateId('concurrent')))
    )
    expect(new Set(ids).size).toBe(100)
  })
})
