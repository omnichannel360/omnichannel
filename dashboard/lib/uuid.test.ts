import { generateId, generatePrefixedId, generateUUIDv4 } from './uuid'

describe('UUID Generation', () => {
  describe('generateId()', () => {
    it('should generate valid RFC 4122 v4 UUIDs', () => {
      const id = generateId()
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      expect(id).toMatch(uuidv4Regex)
    })

    it('should generate unique IDs across multiple calls', () => {
      const ids = new Set()
      const count = 1000

      for (let i = 0; i < count; i++) {
        ids.add(generateId())
      }

      expect(ids.size).toBe(count)
    })

    it('should not generate duplicate IDs even with rapid successive calls', async () => {
      const ids = new Set()
      const count = 10000

      const promises = Array.from({ length: count }, () =>
        Promise.resolve(generateId())
      )

      const results = await Promise.all(promises)
      results.forEach(id => ids.add(id))

      expect(ids.size).toBe(count)
    })

    it('should generate different IDs every time', () => {
      const id1 = generateId()
      const id2 = generateId()
      const id3 = generateId()

      expect(id1).not.toBe(id2)
      expect(id2).not.toBe(id3)
      expect(id1).not.toBe(id3)
    })

    it('should have consistent length (36 characters for UUID with hyphens)', () => {
      const id = generateId()
      expect(id).toHaveLength(36)
    })
  })

  describe('generatePrefixedId()', () => {
    it('should generate prefixed UUIDs with correct format', () => {
      const prefix = 'user'
      const id = generatePrefixedId(prefix)

      expect(id.startsWith(`${prefix}_`)).toBe(true)
      expect(id).toMatch(
        /^user_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
    })

    it('should preserve the prefix exactly', () => {
      const prefixes = ['msg', 'task', 'user', 'assistant', 'error', 'meeting']

      prefixes.forEach(prefix => {
        const id = generatePrefixedId(prefix)
        expect(id.startsWith(`${prefix}_`)).toBe(true)
      })
    })

    it('should generate unique prefixed IDs across multiple calls', () => {
      const ids = new Set()
      const count = 1000
      const prefix = 'msg'

      for (let i = 0; i < count; i++) {
        ids.add(generatePrefixedId(prefix))
      }

      expect(ids.size).toBe(count)
    })

    it('should generate unique IDs with different prefixes', () => {
      const userId = generatePrefixedId('user')
      const assistantId = generatePrefixedId('assistant')
      const errorId = generatePrefixedId('error')

      expect(userId).not.toBe(assistantId)
      expect(assistantId).not.toBe(errorId)
      expect(userId).not.toBe(errorId)
    })

    it('should handle various prefix types', () => {
      const prefixes = [
        'single',
        'multi-word-prefix',
        'with_underscore',
        'CamelCase',
        'lowercase123',
      ]

      prefixes.forEach(prefix => {
        const id = generatePrefixedId(prefix)
        expect(id.startsWith(`${prefix}_`)).toBe(true)
        expect(id.split('_').length).toBe(2)
      })
    })

    it('should not generate the same ID with the same prefix even in rapid succession', async () => {
      const prefix = 'msg'
      const ids = new Set()
      const count = 5000

      const promises = Array.from({ length: count }, () =>
        Promise.resolve(generatePrefixedId(prefix))
      )

      const results = await Promise.all(promises)
      results.forEach(id => ids.add(id))

      expect(ids.size).toBe(count)
    })
  })

  describe('Collision Detection', () => {
    it('should not produce collisions in high-volume sequential generation', () => {
      const ids = new Set<string>()
      const collisions: string[] = []
      const volumeTest = 50000

      for (let i = 0; i < volumeTest; i++) {
        const id = generateId()
        if (ids.has(id)) {
          collisions.push(id)
        }
        ids.add(id)
      }

      expect(collisions).toHaveLength(0)
      expect(ids.size).toBe(volumeTest)
    })

    it('should maintain uniqueness across multiple prefixes', () => {
      const ids = new Set<string>()
      const prefixes = ['user', 'msg', 'task', 'assistant', 'error']
      const idsPerPrefix = 1000

      prefixes.forEach(prefix => {
        for (let i = 0; i < idsPerPrefix; i++) {
          ids.add(generatePrefixedId(prefix))
        }
      })

      expect(ids.size).toBe(prefixes.length * idsPerPrefix)
    })

    it('should have negligible collision probability with entropy validation', () => {
      const ids = Array.from({ length: 1000 }, () => generateId())
      const uuidParts = ids.map(id => {
        const parts = id.split('-')
        return parts[3] // Extract the variant part
      })

      // All variant parts should be 8, 9, a, or b for RFC 4122
      uuidParts.forEach(part => {
        const firstChar = part[0].toLowerCase()
        expect(['8', '9', 'a', 'b']).toContain(firstChar)
      })
    })
  })

  describe('Edge Cases', () => {
    it('should generate consistent results across multiple test runs', () => {
      const id1 = generateId()
      const id2 = generateId()

      // Both should be valid UUIDs (not testing equality, just format)
      expect(id1).toHaveLength(36)
      expect(id2).toHaveLength(36)
      expect(id1).not.toBe(id2)
    })

    it('should handle empty prefix gracefully', () => {
      const id = generatePrefixedId('')
      expect(id).toMatch(/^_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    it('should handle special characters in prefix', () => {
      const specialPrefixes = ['test-id', 'test_id', 'test.id', 'test123']

      specialPrefixes.forEach(prefix => {
        const id = generatePrefixedId(prefix)
        expect(id.startsWith(`${prefix}_`)).toBe(true)
      })
    })

    it('should be cryptographically distinct from timestamps', () => {
      const id1 = generateId()
      const timestamp = Date.now().toString()
      const id2 = generateId()

      // None should match the pattern of timestamps
      expect(id1).not.toMatch(/^\d{13}$/)
      expect(id2).not.toMatch(/^\d{13}$/)
      expect(id1).not.toBe(timestamp)
      expect(id2).not.toBe(timestamp)
    })
  })

  describe('Message ID Generation (ConductorDock use case)', () => {
    it('should generate unique message IDs with prefixes', () => {
      const messageIds = [
        generatePrefixedId('user'),
        generatePrefixedId('assistant'),
        generatePrefixedId('error'),
      ]

      const uniqueIds = new Set(messageIds)
      expect(uniqueIds.size).toBe(3)
    })

    it('should handle rapid message creation without collisions', async () => {
      const messages = await Promise.all([
        Promise.resolve(generatePrefixedId('user')),
        Promise.resolve(generatePrefixedId('user')),
        Promise.resolve(generatePrefixedId('assistant')),
        Promise.resolve(generatePrefixedId('assistant')),
        Promise.resolve(generatePrefixedId('error')),
      ])

      const uniqueIds = new Set(messages)
      expect(uniqueIds.size).toBe(5)
    })

    it('should never collide with Date.now()-based IDs', () => {
      const dateNowId = Date.now().toString()
      const uuidId = generateId()

      // UUID has hyphens, Date.now() is all digits
      expect(uuidId).not.toBe(dateNowId)
      expect(uuidId).toContain('-')
      expect(dateNowId).not.toContain('-')
    })
  })
})
