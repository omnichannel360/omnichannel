# Atomic Operations - Quick Reference Guide

## Overview

Atomic operations ensure that file-based data modifications are **never partially written** and **never lost** in concurrent scenarios.

All operations use **file-level locking** with FIFO queue serialization.

---

## API Reference

### atomicRead<T>(filePath: string): Promise<T>
Read a JSON file safely with lock protection.

**Usage:**
```typescript
import { atomicRead } from '@/lib/atomic-file-ops'

// Read alerts
const alerts = await atomicRead<Alert[]>('data/alerts.json')
```

**Guarantees:**
- Reader cannot observe partial/corrupted data
- Multiple concurrent readers work correctly
- Returns empty array/object if file doesn't exist

**When to use:** Any GET endpoint, reading data for queries

---

### atomicWrite<T>(filePath: string, data: T): Promise<void>
Write a JSON file safely with atomic rename.

**Usage:**
```typescript
import { atomicWrite } from '@/lib/atomic-file-ops'

const tasks: Task[] = [/* ... */]
await atomicWrite('data/tasks.json', tasks)
```

**Guarantees:**
- File never left in partially-written state
- Write → temp file → atomic rename
- No corruption even if process crashes

**When to use:** Bulk writes, data migrations, file replacements

---

### atomicUpdate<T, R>(filePath: string, updateFn: (current: T) => AtomicUpdateResult<T, R>): Promise<R>
**Most common pattern:** Read-modify-write in single atomic operation.

**Usage:**
```typescript
import { atomicUpdate } from '@/lib/atomic-file-ops'

// Add new alert
const newAlert = await atomicUpdate<Alert[], Alert>('data/alerts.json', async (alerts) => {
  const created: Alert = {
    id: generateId('alert'),
    timestamp: new Date().toISOString(),
    level: 'warning',
    component: 'API',
    message: 'Test alert',
    status: 'active'
  }
  const updated = [...alerts, created]
  return { updated, result: created }
})
```

**Guarantees:**
- Lock held from read → modify → write
- No other request can read/write during operation
- If updateFn throws, file unchanged (rollback)

**Update function must return:**
```typescript
{
  updated: T,  // New data to write
  result: R    // Value to return from atomicUpdate
}
```

**When to use:** POST (create), PUT (update), DELETE (remove from array)

---

### atomicReadModifyWrite<T>(filePath: string, modifyFn: (current: T) => Promise<T> | T): Promise<T>
Convenience wrapper for atomicUpdate when you don't need a separate result type.

**Usage:**
```typescript
import { atomicReadModifyWrite } from '@/lib/atomic-file-ops'

// Update task status
const updated = await atomicReadModifyWrite<Task[]>('data/tasks.json', async (tasks) => {
  const index = tasks.findIndex(t => t.id === taskId)
  if (index === -1) throw new Error('Task not found')
  
  const updated = { ...tasks[index], status: 'done' }
  return [
    ...tasks.slice(0, index),
    updated,
    ...tasks.slice(index + 1)
  ]
})
```

**When to use:** Updates where returned value = modified data

---

### atomicTransaction<T, R>(filePath: string, fn: (read, write) => Promise<R>): Promise<R>
For complex operations requiring multiple reads and writes.

**Usage:**
```typescript
import { atomicTransaction } from '@/lib/atomic-file-ops'

const result = await atomicTransaction<Task[], string>('data/tasks.json', async (read, write) => {
  // Read multiple times
  const allTasks = await read()
  const doneTasks = allTasks.filter(t => t.status === 'done')
  
  // Multiple writes
  if (doneTasks.length > 5) {
    const archived = allTasks.filter(t => t.status !== 'done')
    await write(archived)
    return `Archived ${doneTasks.length} tasks`
  }
  
  return 'No archiving needed'
})
```

**Guarantees:**
- Lock held for entire transaction
- Both read() and write() use cached data from same snapshot

**When to use:** Complex multi-step operations

---

### atomicReaddir(dirPath: string): Promise<string[]>
Safely enumerate directory with mkdir protection.

**Usage:**
```typescript
import { atomicReaddir } from '@/lib/atomic-dir-ops'

const memories = await atomicReaddir('company-brain/memories')
for (const file of memories.filter(f => f.endsWith('.json'))) {
  const data = await atomicRead(path.join('company-brain/memories', file))
}
```

**Guarantees:**
- Directory created if not exists
- Enumeration atomic (no file appears/disappears during read)
- No race with concurrent mkdir attempts

**When to use:** Directory enumeration, file listings

---

### atomicMkdir(dirPath: string): Promise<void>
Safely create directory (idempotent).

**Usage:**
```typescript
import { atomicMkdir } from '@/lib/atomic-dir-ops'

await atomicMkdir('data/memories/2026')
// Safe to call multiple times concurrently
```

**Guarantees:**
- Directory created or already exists
- No EEXIST errors
- Serialized with locking

**When to use:** Before writing files to directories

---

## Common Patterns

### Pattern 1: Array Append (Alerts, Logs)
```typescript
const newAlert = await atomicUpdate<Alert[], Alert>(ALERTS_FILE, async (alerts) => {
  const created = { id: generateId('alert'), ...alertData, status: 'active' }
  return { updated: [...alerts, created], result: created }
})
```

### Pattern 2: Array Element Update
```typescript
const updated = await atomicUpdate<Task[], Task>(TASKS_FILE, async (tasks) => {
  const index = tasks.findIndex(t => t.id === taskId)
  if (index === -1) throw new Error('Not found')
  
  const modified = { ...tasks[index], ...changes }
  const newTasks = [
    ...tasks.slice(0, index),
    modified,
    ...tasks.slice(index + 1)
  ]
  return { updated: newTasks, result: modified }
})
```

### Pattern 3: Array Element Delete
```typescript
const deleted = await atomicUpdate<Task[], Task>(TASKS_FILE, async (tasks) => {
  const index = tasks.findIndex(t => t.id === taskId)
  if (index === -1) throw new Error('Not found')
  
  const item = tasks[index]
  const updated = [
    ...tasks.slice(0, index),
    ...tasks.slice(index + 1)
  ]
  return { updated, result: item }
})
```

### Pattern 4: Conditional Update with Rollback
```typescript
const result = await atomicTransaction<Config, boolean>(CONFIG_FILE, async (read, write) => {
  const current = await read()
  
  // Check condition
  if (current.version < 2) {
    throw new Error('Cannot update - version too old')
    // write() never called → file unchanged
  }
  
  // Update
  const updated = { ...current, version: 3 }
  await write(updated)
  return true
})
```

---

## Error Handling

All atomic operations throw errors on failures. Handle them properly:

```typescript
try {
  await atomicUpdate<Alert[], Alert>(ALERTS_FILE, async (alerts) => {
    // Your update logic
    return { updated: newAlerts, result: newAlert }
  })
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('Failed to acquire lock')) {
      // Timeout acquiring lock - data unchanged
      return NextResponse.json(
        { error: 'Service temporarily busy' },
        { status: 503 }
      )
    }
    if (error.message.includes('ENOENT')) {
      // File doesn't exist - check if that's expected
      console.error('Data file missing:', error)
      return NextResponse.json(
        { error: 'Data file missing' },
        { status: 500 }
      )
    }
  }
  throw error
}
```

**Common Errors:**
- `Failed to acquire lock after X retries` - Timeout acquiring lock (stale lock recovery)
- `ENOENT` - File doesn't exist (check initialization)
- `EACCES` - Permission denied (file system permissions)
- `Invalid file path` - safeJoin() detected path traversal

---

## Performance Notes

**Lock Times:**
- Single operation: < 1ms
- 10 concurrent: ~5-10ms average
- 50 concurrent: ~50-100ms average
- Max wait: 30s (timeout before stale lock detected)

**Memory:**
- Per-file lock: ~200 bytes
- Lock queue: O(n) concurrent operations
- Typical: < 10MB overhead

**Throughput:**
- File-based: ~50 ops/sec under serialization
- Trade-off: Correctness over throughput (acceptable)

---

## Testing

### Test Concurrent Operations
```typescript
it('POST alerts concurrently', async () => {
  const promises: Promise<Alert>[] = []
  for (let i = 0; i < 10; i++) {
    promises.push(
      atomicUpdate<Alert[], Alert>(ALERTS_FILE, async (alerts) => {
        const alert = { id: `alert-${i}`, ...data }
        return { updated: [...alerts, alert], result: alert }
      })
    )
  }
  
  const results = await Promise.all(promises)
  const final = await atomicRead<Alert[]>(ALERTS_FILE)
  
  expect(final.length).toBe(10)
  expect(new Set(final.map(a => a.id)).size).toBe(10) // No duplicates
})
```

---

## Migration from unsafe patterns

**BEFORE (Unsafe - Race conditions):**
```typescript
const data = JSON.parse(await fs.readFile(path))
data.push(newItem)
await fs.writeFile(path, JSON.stringify(data))  // RACE CONDITION!
```

**AFTER (Safe - Atomic):**
```typescript
await atomicUpdate(path, async (data) => {
  return { updated: [...data, newItem], result: newItem }
})
```

---

## Path Traversal Safety

All file paths must use `safeJoin()` helper:

```typescript
import { safeJoin } from '@/lib/validation'

// WRONG - Vulnerable
const filePath = path.join(baseDir, userInput)

// CORRECT - Safe
const filePath = safeJoin(baseDir, userInput)
// Blocks: "../../../etc/passwd", "./../../secret.json", "/etc/passwd"
```

---

## References

- Lock implementation: `lib/file-lock.ts`
- Atomic operations: `lib/atomic-file-ops.ts`
- Directory operations: `lib/atomic-dir-ops.ts`
- Tests: `__tests__/api/race-conditions.test.ts`
- Validation: `lib/validation.ts` (safeJoin, schemas)

---

Generated: 2026-10-22
