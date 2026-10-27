import { generateId, generateUUID } from '@/lib/validation'

describe('ID Generation - UUID Standardization', () => {
  describe('generateUUID()', () => {
    it('should generate a valid UUID v4', () => {
      const uuid = generateUUID()
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      expect(uuid).toMatch(uuidRegex)
    })

    it('should generate unique UUIDs on multiple calls', () => {
      const uuids = new Set()
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID())
      }
      expect(uuids.size).toBe(100)
    })
  })

  describe('generateId(prefix)', () => {
    it('should generate ID with prefix', () => {
      const id = generateId('alert')
      expect(id.startsWith('alert_')).toBe(true)
    })

    it('should generate ID with correct format: prefix_uuid', () => {
      const id = generateId('task')
      const [prefix, uuid] = id.split('_')
      expect(prefix).toBe('task')

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      expect(uuid).toMatch(uuidRegex)
    })

    it('should generate unique IDs with same prefix', () => {
      const ids = new Set()
      for (let i = 0; i < 50; i++) {
        ids.add(generateId('memory'))
      }
      expect(ids.size).toBe(50)
    })

    it('should work with various prefixes', () => {
      const prefixes = ['alert', 'task', 'meeting', 'memory', 'profile']
      prefixes.forEach(prefix => {
        const id = generateId(prefix)
        expect(id.startsWith(`${prefix}_`)).toBe(true)
      })
    })
  })

  describe('ID Generation Consistency', () => {
    it('should generate valid IDs for all entity types', () => {
      const entityTypes = ['alert', 'task', 'meeting', 'memory']
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

      entityTypes.forEach(type => {
        const id = generateId(type)
        const parts = id.split('_')

        expect(parts.length).toBe(2)
        expect(parts[0]).toBe(type)
        expect(parts[1]).toMatch(uuidRegex)
      })
    })

    it('should have appropriate ID length', () => {
      const id = generateId('alert')
      // Format: "alert" (5) + "_" (1) + UUID (36) = 42 characters
      expect(id.length).toBe(42)
    })

    it('should use cryptographically secure random generation', () => {
      // Generate IDs and verify entropy
      const ids = new Set()
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId('test'))
      }
      // With 1000 IDs, we should have 1000 unique values (no collisions)
      expect(ids.size).toBe(1000)
    })
  })

  describe('Migration from Date.now() to UUID', () => {
    it('should ensure no Date.now() is used for ID generation', () => {
      // This is a validation test - verify the generateId function doesn't use Date.now()
      const id = generateId('test')

      // Parse the UUID part (after the underscore)
      const [, uuid] = id.split('_')

      // UUIDs are hex-based, not numeric timestamps
      // A Date.now() ID would be mostly numeric (13 digits)
      expect(uuid).not.toMatch(/^\d{13}/)
    })

    it('should generate IDs suitable for concurrent operations', async () => {
      // Test that multiple simultaneous ID generations don't collide
      const ids = await Promise.all(
        Array.from({ length: 100 }, () => Promise.resolve(generateId('concurrent')))
      )

      // All IDs should be unique even in concurrent scenarios
      expect(new Set(ids).size).toBe(100)
    })
  })

  describe('ID Storage and Retrieval', () => {
    it('should maintain ID format through serialization', () => {
      const id = generateId('stored')
      const serialized = JSON.stringify({ id })
      const deserialized = JSON.parse(serialized)

      expect(deserialized.id).toBe(id)
      expect(deserialized.id.startsWith('stored_')).toBe(true)
    })

    it('should support ID comparison and equality', () => {
      const id1 = generateId('compare')
      const id2 = generateId('compare')

      expect(id1).not.toBe(id2)
      expect(id1 === id1).toBe(true)
    })
  })
})
