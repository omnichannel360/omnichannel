import { ensureDataDir } from '@/lib/ensure-dir'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

jest.mock('fs', () => {
  const actual = jest.requireActual('fs')
  return {
    promises: {
      mkdir: jest.fn(actual.promises.mkdir),
    },
  }
})

describe('ensureDataDir', () => {
  const mockFs = require('fs').promises

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should create directory if it does not exist', async () => {
    const testDir = path.join(os.tmpdir(), 'test-ensure-dir-' + Date.now())

    try {
      await ensureDataDir(testDir)
      // Verify directory was created
      const stat = await fs.stat(testDir)
      expect(stat.isDirectory()).toBe(true)
    } finally {
      // Cleanup
      try {
        await fs.rm(testDir, { recursive: true })
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  it('should not throw if directory already exists', async () => {
    const testDir = path.join(os.tmpdir(), 'test-ensure-dir-exists-' + Date.now())

    try {
      // Create directory first
      await fs.mkdir(testDir, { recursive: true })

      // Should not throw
      await expect(ensureDataDir(testDir)).resolves.toBeUndefined()
    } finally {
      // Cleanup
      try {
        await fs.rm(testDir, { recursive: true })
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  it('should create nested directories', async () => {
    const testDir = path.join(
      os.tmpdir(),
      'test-nested-' + Date.now(),
      'level1',
      'level2'
    )

    try {
      await ensureDataDir(testDir)
      const stat = await fs.stat(testDir)
      expect(stat.isDirectory()).toBe(true)
    } finally {
      // Cleanup parent
      try {
        const parentDir = path.dirname(path.dirname(testDir))
        await fs.rm(parentDir, { recursive: true })
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  it('should throw on permission errors', async () => {
    mockFs.mkdir.mockRejectedValueOnce(
      Object.assign(new Error('Permission denied'), { code: 'EACCES' })
    )

    await expect(ensureDataDir('/invalid/path')).rejects.toThrow('Permission denied')
  })

  it('should use recursive flag', async () => {
    const testDir = path.join(os.tmpdir(), 'test-recursive-' + Date.now())

    try {
      await ensureDataDir(testDir)
      // Verify mkdir was called with recursive: true
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true }
      )
    } finally {
      // Cleanup
      try {
        await fs.rm(testDir, { recursive: true })
      } catch {
        // Ignore cleanup errors
      }
    }
  })
})
