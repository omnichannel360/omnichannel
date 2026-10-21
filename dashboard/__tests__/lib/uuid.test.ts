import { generateId, generatePrefixedId } from '@/lib/uuid'

describe('UUID Generation', () => {
  describe('generateId', () => {
    it('generates a valid RFC 4122 v4 UUID', () => {
      const id = generateId()
      // RFC 4122 v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      // where y is [8-9a-b] and x is [0-9a-f]
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      expect(id).toMatch(uuidRegex)
    })

    it('generates unique IDs on successive calls', () => {
      const ids = new Set<string>()
      const iterations = 1000

      for (let i = 0; i < iterations; i++) {
        ids.add(generateId())
      }

      // All IDs should be unique
      expect(ids.size).toBe(iterations)
    })

    it('generates different UUIDs in rapid succession', () => {
      const id1 = generateId()
      const id2 = generateId()
      const id3 = generateId()

      expect(id1).not.toBe(id2)
      expect(id2).not.toBe(id3)
      expect(id1).not.toBe(id3)
    })

    it('returns string type', () => {
      const id = generateId()
      expect(typeof id).toBe('string')
    })

    it('returns 36 character string (standard UUID length)', () => {
      const id = generateId()
      expect(id).toHaveLength(36)
    })

    it('contains hyphens at correct positions', () => {
      const id = generateId()
      // UUID format: 8-4-4-4-12
      expect(id[8]).toBe('-')
      expect(id[13]).toBe('-')
      expect(id[18]).toBe('-')
      expect(id[23]).toBe('-')
    })

    it('has version 4 in correct position', () => {
      const id = generateId()
      // Version is in 7th group (position 14-15), should start with 4
      const versionChar = id[14]
      expect(versionChar).toBe('4')
    })

    it('has variant bits in correct position', () => {
      const id = generateId()
      // Variant is in 9th group (position 19), should be [8-9a-b]
      const variantChar = id[19]
      expect(['8', '9', 'a', 'A', 'b', 'B']).toContain(variantChar)
    })
  })

  describe('generatePrefixedId', () => {
    it('generates prefixed UUID with correct format', () => {
      const id = generatePrefixedId('msg')
      expect(id).toMatch(/^msg_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    it('includes prefix in generated ID', () => {
      const id = generatePrefixedId('user')
      expect(id).toStartWith('user_')
    })

    it('generates unique prefixed IDs', () => {
      const ids = new Set<string>()
      const iterations = 500

      for (let i = 0; i < iterations; i++) {
        ids.add(generatePrefixedId('task'))
      }

      expect(ids.size).toBe(iterations)
    })

    it('supports different prefixes', () => {
      const userMsg = generatePrefixedId('user')
      const assistantMsg = generatePrefixedId('assistant')
      const errorMsg = generatePrefixedId('error')

      expect(userMsg).toStartWith('user_')
      expect(assistantMsg).toStartWith('assistant_')
      expect(errorMsg).toStartWith('error_')
    })

    it('allows empty prefix', () => {
      const id = generatePrefixedId('')
      expect(id).toMatch(/^_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    it('preserves prefix exactly', () => {
      const prefix = 'special-prefix-123'
      const id = generatePrefixedId(prefix)
      expect(id).toStartWith(`${prefix}_`)
    })

    it('generates same prefix with different UUIDs', () => {
      const msg1 = generatePrefixedId('msg')
      const msg2 = generatePrefixedId('msg')

      expect(msg1).toStartWith('msg_')
      expect(msg2).toStartWith('msg_')
      expect(msg1).not.toBe(msg2) // UUIDs should be different
    })
  })

  describe('Collision resistance', () => {
    it('generates no collisions in high-volume test (10000 IDs)', () => {
      const ids = new Set<string>()
      const iterations = 10000

      for (let i = 0; i < iterations; i++) {
        const id = generateId()
        expect(ids.has(id)).toBe(false) // Should never have seen this ID before
        ids.add(id)
      }

      expect(ids.size).toBe(iterations)
    })

    it('handles concurrent-like generation correctly', () => {
      // Simulate concurrent calls by generating many IDs
      const promises = []
      for (let i = 0; i < 100; i++) {
        promises.push(Promise.resolve(generateId()))
      }

      return Promise.all(promises).then(ids => {
        const uniqueIds = new Set(ids)
        expect(uniqueIds.size).toBe(100)
      })
    })
  })

  describe('Backwards compatibility', () => {
    it('generateId() can replace Date.now().toString()', () => {
      const uuidId = generateId()
      // UUID should have the same purpose as Date.now().toString()
      // - Generate a unique string
      // - Can be used as object key or ID
      expect(typeof uuidId).toBe('string')
      expect(uuidId.length).toBeGreaterThan(0)

      // Should be usable as object key
      const obj: Record<string, boolean> = {}
      obj[uuidId] = true
      expect(obj[uuidId]).toBe(true)
    })

    it('ConductorDock component can use generatePrefixedId for message IDs', () => {
      const userMsg = generatePrefixedId('user')
      const assistantMsg = generatePrefixedId('assistant')
      const errorMsg = generatePrefixedId('error')

      // All should be valid message IDs
      expect(userMsg).toBeDefined()
      expect(assistantMsg).toBeDefined()
      expect(errorMsg).toBeDefined()

      // All should be unique
      const allIds = [userMsg, assistantMsg, errorMsg]
      const uniqueIds = new Set(allIds)
      expect(uniqueIds.size).toBe(3)
    })
  })
})
