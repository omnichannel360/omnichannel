# Async I/O Patterns - Developer Guide

Quick reference for implementing async file operations in this codebase.

## Pattern 1: Loading JSON Files

### ✅ Correct Pattern

```typescript
import { promises as fs } from 'fs'
import { withFileLock } from '@/lib/file-lock'

async function loadData(filePath: string): Promise<Data[]> {
  return withFileLock(filePath, async () => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      try {
        return JSON.parse(content)
      } catch (parseError) {
        throw new Error('File contains invalid JSON')
      }
    } catch (error) {
      // Handle file not found, permission errors, etc.
      throw error
    }
  })
}
```

### ❌ Wrong Patterns to Avoid

```typescript
// ❌ WRONG: Synchronous
const data = fs.readFileSync(filePath, 'utf-8')

// ❌ WRONG: No file locking
const data = await fs.readFile(filePath, 'utf-8')

// ❌ WRONG: No JSON error handling
const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))

// ❌ WRONG: No try-catch
return fs.readFile(filePath, 'utf-8').then(JSON.parse)

// ❌ WRONG: Using require() for JSON
const data = require('./data.json')
```

---

## Pattern 2: Saving JSON Files

### ✅ Correct Pattern

```typescript
async function saveData(filePath: string, data: Data[]): Promise<void> {
  return withFileLock(filePath, async () => {
    const dir = path.dirname(filePath)
    try {
      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true })
      
      // Write with formatting for readability
      await fs.writeFile(
        filePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to save data: ${message}`)
    }
  })
}
```

### ❌ Wrong Patterns

```typescript
// ❌ WRONG: Synchronous
fs.writeFileSync(filePath, JSON.stringify(data))

// ❌ WRONG: No file locking
await fs.writeFile(filePath, JSON.stringify(data))

// ❌ WRONG: No directory creation
await fs.writeFile(filePath, JSON.stringify(data))

// ❌ WRONG: No error context
await fs.writeFile(filePath, JSON.stringify(data)).catch(() => null)

// ❌ WRONG: JSON stringification without formatting
await fs.writeFile(filePath, JSON.stringify(data))
```

---

## Pattern 3: Checking File Existence

### ✅ Correct Pattern

```typescript
async function ensureFile(filePath: string): Promise<void> {
  const dir = path.dirname(filePath)
  
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // Already exists
  }

  try {
    await fs.stat(filePath)
    // File exists
  } catch {
    // File doesn't exist, create with defaults
    await fs.writeFile(filePath, JSON.stringify([], null, 2), 'utf-8')
  }
}
```

### ❌ Wrong Patterns

```typescript
// ❌ WRONG: Synchronous
if (fs.existsSync(filePath)) {
  // ...
}

// ❌ WRONG: synchronous stat
if (!fs.statSync(filePath)) {
  // ...
}

// ❌ WRONG: No error handling
const stat = await fs.stat(filePath)
```

---

## Pattern 4: Concurrent Read/Write

### ✅ Correct Pattern (File Locking)

```typescript
// Multiple requests to same file are queued
const [data1, data2] = await Promise.all([
  loadData(filePath),  // Request 1 - Acquires lock, reads, releases
  loadData(filePath)   // Request 2 - Waits for lock, reads, releases
])

// Writing updates atomically
const data = await loadData(filePath)
data.push(newItem)
await saveData(filePath, data)
// Lock prevents another request from reading stale data
```

### ❌ Wrong Patterns

```typescript
// ❌ WRONG: Race condition
const data = await fs.readFile(filePath, 'utf-8')
const parsed = JSON.parse(data)
parsed.push(item)
// Another request might write here, overwriting this data
await fs.writeFile(filePath, JSON.stringify(parsed))

// ❌ WRONG: No synchronization
Promise.all([
  saveData(filePath, data1),
  saveData(filePath, data2)  // Both might write, data loss occurs
])
```

---

## Pattern 5: Error Handling

### ✅ Correct Pattern

```typescript
export async function GET(request: NextRequest) {
  try {
    const data = await loadData(filePath)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    
    // Log with context
    console.error('[API] Failed to load data:', message)
    
    // Return user-friendly error
    return NextResponse.json(
      { success: false, error: 'Failed to load data' },
      { status: 500 }
    )
  }
}
```

### ❌ Wrong Patterns

```typescript
// ❌ WRONG: Silent failure
data = await loadData(filePath).catch(() => null)

// ❌ WRONG: Exposing internal errors
return NextResponse.json(
  { error: error.stack },
  { status: 500 }
)

// ❌ WRONG: No error context
throw error

// ❌ WRONG: Catching and ignoring
try {
  await saveData(filePath, data)
} catch {
  // Silently fail
}
```

---

## Pattern 6: Directory Operations

### ✅ Correct Pattern

```typescript
async function ensureDataDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true })
  } catch (error) {
    // Directory already exists or permission error
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      return // Expected
    }
    throw error // Permission or other error
  }
}
```

### ❌ Wrong Patterns

```typescript
// ❌ WRONG: Synchronous
fs.mkdirSync(dirPath, { recursive: true })

// ❌ WRONG: No error handling
await fs.mkdir(dirPath, { recursive: true })

// ❌ WRONG: Assuming success
await fs.mkdir(dirPath)  // Throws if not recursive
```

---

## Pattern 7: Reading Directory Contents

### ✅ Correct Pattern

```typescript
async function loadAllFiles(dirPath: string): Promise<Data[]> {
  const allData: Data[] = []
  
  try {
    await fs.stat(dirPath)
  } catch {
    return []  // Directory doesn't exist
  }

  try {
    const files = await fs.readdir(dirPath)
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    
    await Promise.all(
      jsonFiles.map(async file => {
        try {
          const content = await fs.readFile(
            path.join(dirPath, file),
            'utf-8'
          )
          allData.push(...JSON.parse(content))
        } catch (error) {
          console.error(`Failed to load ${file}:`, error)
          // Continue with other files
        }
      })
    )
  } catch (error) {
    console.error('Failed to read directory:', error)
  }

  return allData
}
```

### ❌ Wrong Patterns

```typescript
// ❌ WRONG: Synchronous
const files = fs.readdirSync(dirPath)

// ❌ WRONG: No Promise.all
for (const file of files) {
  await fs.readFile(path.join(dirPath, file))
  // Slow! Processes files sequentially
}

// ❌ WRONG: No error handling for individual files
Promise.all(
  files.map(f => fs.readFile(path.join(dirPath, f)))
  // One failed file stops all reads
)
```

---

## Pattern 8: Using File Locks

### ✅ Correct Pattern

```typescript
import { withFileLock } from '@/lib/file-lock'

async function updateData(filePath: string, updater: (data: Data[]) => Data[]): Promise<Data[]> {
  return withFileLock(filePath, async () => {
    // Critical section - exclusive access guaranteed
    const data = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(data) as Data[]
    
    const updated = updater(parsed)
    
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8')
    
    return updated
  })
}

// Usage: Multiple concurrent requests are automatically serialized
await Promise.all([
  updateData(filePath, data => [...data, item1]),
  updateData(filePath, data => [...data, item2])
])
// Result: Both items added, no data loss
```

### ❌ Wrong Patterns

```typescript
// ❌ WRONG: Manual lock management
const lockFile = filePath + '.lock'
// Trying to implement locks is error-prone

// ❌ WRONG: No lock at all
await Promise.all([
  saveTasks(filePath, tasks1),
  saveTasks(filePath, tasks2)
  // Data loss likely!
])

// ❌ WRONG: Using deprecated 'fs' callback API
fs.readFile(filePath, (err, data) => {
  // Callback style is deprecated
})
```

---

## Testing Patterns

### ✅ Correct Test Pattern

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

describe('Data Loading', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), 'test-' + Date.now())
    await fs.mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('should load valid JSON', async () => {
    const filePath = path.join(tempDir, 'data.json')
    const testData = [{ id: 1, name: 'test' }]

    await fs.writeFile(filePath, JSON.stringify(testData), 'utf-8')
    const loaded = await loadData(filePath)

    expect(loaded).toEqual(testData)
  })

  it('should handle concurrent reads', async () => {
    const filePath = path.join(tempDir, 'data.json')
    const testData = [{ id: 1 }]

    await fs.writeFile(filePath, JSON.stringify(testData), 'utf-8')

    const results = await Promise.all([
      loadData(filePath),
      loadData(filePath),
      loadData(filePath)
    ])

    expect(results).toHaveLength(3)
    expect(results.every(r => r[0].id === 1)).toBe(true)
  })

  it('should handle corrupted JSON', async () => {
    const filePath = path.join(tempDir, 'data.json')
    await fs.writeFile(filePath, 'invalid json', 'utf-8')

    await expect(loadData(filePath)).rejects.toThrow()
  })
})
```

---

## Checklist for New File I/O Code

- [ ] Using `import { promises as fs } from 'fs'`?
- [ ] All file operations use `await`?
- [ ] Using `withFileLock` for read/write?
- [ ] Has `try-catch` for error handling?
- [ ] JSON parse errors handled separately?
- [ ] Directory creation uses `recursive: true`?
- [ ] Error messages are user-friendly?
- [ ] Tests cover concurrent access?
- [ ] Tests cover file not found scenario?
- [ ] Tests cover corrupted JSON scenario?
- [ ] No `readFileSync`, `writeFileSync`, `existsSync`?
- [ ] No `require()` for JSON files?

---

## Migration from Sync to Async

If you find old sync code, use this migration guide:

### 1. Import Change
```typescript
// Before
import * as fs from 'fs'

// After
import { promises as fs } from 'fs'
import { withFileLock } from '@/lib/file-lock'
```

### 2. Function Signature
```typescript
// Before
function loadData(): Data[] {

// After
async function loadData(): Promise<Data[]> {
  return withFileLock(filePath, async () => {
```

### 3. Replace readFileSync
```typescript
// Before
const data = fs.readFileSync(filePath, 'utf-8')

// After
const data = await fs.readFile(filePath, 'utf-8')
```

### 4. Replace writeFileSync
```typescript
// Before
fs.writeFileSync(filePath, JSON.stringify(data))

// After
await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
```

### 5. Replace existsSync
```typescript
// Before
if (fs.existsSync(filePath)) {

// After
try {
  await fs.stat(filePath)
  // exists
} catch {
  // not found
}
```

---

## Performance Tips

1. **Use `Promise.all` for parallel reads**
   ```typescript
   // Good: Reads happen in parallel
   const [data1, data2] = await Promise.all([
     fs.readFile(file1, 'utf-8'),
     fs.readFile(file2, 'utf-8')
   ])
   ```

2. **Batch writes when possible**
   ```typescript
   // Better: One file write with all data
   await fs.writeFile(filePath, JSON.stringify(allData), 'utf-8')
   
   // Not good: Multiple writes
   for (const item of items) {
     await fs.writeFile(itemPath, JSON.stringify(item), 'utf-8')
   }
   ```

3. **Cache static data**
   ```typescript
   // Load config once at startup
   const config = await loadConfig()
   // Reuse in handlers
   export async function GET(req) {
     return NextResponse.json(config)
   }
   ```

---

## Common Pitfalls

1. **Forgetting `await`**
   ```typescript
   // ❌ Returns promise instead of data
   const data = fs.readFile(filePath, 'utf-8')
   
   // ✅ Awaits the promise
   const data = await fs.readFile(filePath, 'utf-8')
   ```

2. **Not wrapping in lock**
   ```typescript
   // ❌ Multiple requests can corrupt data
   const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
   data.push(item)
   await fs.writeFile(filePath, JSON.stringify(data), 'utf-8')
   
   // ✅ Lock prevents race conditions
   return withFileLock(filePath, async () => {
     // exclusive access
   })
   ```

3. **Not handling JSON errors**
   ```typescript
   // ❌ Throws generic error
   const data = JSON.parse(content)
   
   // ✅ Distinguishes parse errors
   try {
     return JSON.parse(content)
   } catch (parseError) {
     throw new Error('Invalid JSON')
   }
   ```

4. **Blocking the event loop**
   ```typescript
   // ❌ Synchronous operations block everything
   const data = fs.readFileSync(filePath)
   processLargeData(data)  // Blocks all other requests
   
   // ✅ Async operations don't block
   const data = await fs.readFile(filePath)
   processLargeData(data)  // Other requests can run
   ```

---

## References

- [Node.js fs.promises](https://nodejs.org/api/fs.html#fs_promises_api)
- [MDN: async/await](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Async_await)
- [File Locking Utility](./lib/file-lock.ts)
- [Implementation Report](./ASYNC_IO_IMPLEMENTATION.md)

---

**Last Updated**: 2026-10-22  
**Version**: 1.0  
**Status**: Active
