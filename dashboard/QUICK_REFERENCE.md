# QUICK REFERENCE - Atomic File Operations

## Usage Examples for Each API Route

### 1. Alerts API (/api/alerts)

\\\	ypescript
import { atomicRead, atomicUpdate } from '@/lib/atomic-file-ops'

// GET - Read all alerts
const alerts = await atomicRead<Alert[]>(ALERTS_LOG)

// POST - Add new alert (atomic)
const result = await atomicUpdate<Alert[], Alert>(ALERTS_LOG, async (alerts) => {
  const newAlert = createAlert(level, component, message)
  const updated = [...alerts, newAlert]
  return { updated, result: newAlert }
})

// PATCH - Update alert status (atomic)
const result = await atomicUpdate<Alert[], Alert>(ALERTS_LOG, async (alerts) => {
  const index = alerts.findIndex(a => a.id === alert_id)
  if (index === -1) throw new Error('Alert not found')
  
  const updated = [
    ...alerts.slice(0, index),
    { ...alerts[index], status },
    ...alerts.slice(index + 1)
  ]
  return { updated, result: updated[index] }
})
\\\

### 2. Kanban API (/api/kanban)

\\\	ypescript
import { atomicRead, atomicUpdate } from '@/lib/atomic-file-ops'

// GET - Read all tasks
const tasks = await atomicRead<Task[]>(DATA_FILE)

// POST - Create task (atomic)
const result = await atomicUpdate<Task[], Task>(DATA_FILE, async (tasks) => {
  const newTask: Task = { id: crypto.randomUUID(), title, status }
  const updated = [...tasks, newTask]
  return { updated, result: newTask }
})

// PUT - Update task (atomic)
const result = await atomicUpdate<Task[], Task>(DATA_FILE, async (tasks) => {
  const index = tasks.findIndex(t => t.id === id)
  if (index === -1) throw new Error('Task not found')
  
  const updated = [
    ...tasks.slice(0, index),
    { ...tasks[index], ...Object.fromEntries(...) },
    ...tasks.slice(index + 1)
  ]
  return { updated, result: updated[index] }
})

// DELETE - Remove task (atomic)
await atomicUpdate<Task[], void>(DATA_FILE, async (tasks) => {
  const filtered = tasks.filter(t => t.id !== id)
  if (filtered.length === tasks.length) throw new Error('Task not found')
  return { updated: filtered, result: undefined }
})
\\\

### 3. Brain API (/api/brain)

\\\	ypescript
import { atomicRead } from '@/lib/atomic-file-ops'

// GET - Read memories (already concurrent-safe)
for (const file of files) {
  const data = await atomicRead<MemoryData[] | Record<string, unknown>>(
    path.join(BRAIN_DIR, file)
  )
  // Process data...
}
\\\

### 4. Meetings API (/api/meetings)

\\\	ypescript
import { atomicRead, atomicUpdate, atomicWrite } from '@/lib/atomic-file-ops'

// GET - Read meetings and logs
const meetings = await atomicRead<Record<string, Meeting>>(MEETINGS_DATA_PATH)
const logs = await atomicRead<MeetingLog[]>(MEETINGS_LOG)

// POST - Log meeting (atomic with brain write)
const savedLog = await atomicUpdate<MeetingLog[], MeetingLog>(
  MEETINGS_LOG, 
  async (logs) => {
    const updated = [...logs, log]
    return { updated, result: log }
  }
)
await logToBrain(savedLog) // atomicWrite inside
\\\

---

## Common Patterns

### Pattern 1: Find and Update Single Item

\\\	ypescript
const result = await atomicUpdate<Item[], Item>(filePath, async (items) => {
  const index = items.findIndex(i => i.id === targetId)
  if (index === -1) throw new Error('Not found')
  
  const updated = [...items]
  updated[index] = { ...updated[index], ...changes }
  return { updated, result: updated[index] }
})
\\\

### Pattern 2: Add Item to Array

\\\	ypescript
const result = await atomicUpdate<Item[], Item>(filePath, async (items) => {
  const newItem = { id: generateId(), ...data }
  const updated = [...items, newItem]
  return { updated, result: newItem }
})
\\\

### Pattern 3: Remove Item from Array

\\\	ypescript
const result = await atomicUpdate<Item[], void>(filePath, async (items) => {
  const filtered = items.filter(i => i.id !== targetId)
  if (filtered.length === items.length) throw new Error('Not found')
  return { updated: filtered, result: undefined }
})
\\\

### Pattern 4: Update Entire Object

\\\	ypescript
const result = await atomicUpdate<Config, Config>(filePath, async (current) => {
  const updated = { ...current, ...changes }
  return { updated, result: updated }
})
\\\

### Pattern 5: Complex Multi-Step Operation

\\\	ypescript
const result = await atomicTransaction<Data, Result>(filePath, async (read, write) => {
  const current = await read()
  
  // Step 1: Validate
  if (!isValid(current)) throw new Error('Invalid state')
  
  // Step 2: Transform
  const modified = transform(current)
  
  // Step 3: Write
  await write(modified)
  
  // Step 4: Return result
  return { success: true, data: modified }
})
\\\

---

## Error Handling

### Handle Lock Timeout

\\\	ypescript
try {
  const result = await atomicUpdate(filePath, updateFn)
} catch (error) {
  if (error.message.includes('Failed to acquire lock')) {
    // Lock timeout - too much contention
    return NextResponse.json(
      { success: false, error: 'Operation busy, please retry' },
      { status: 503 } // Service Unavailable
    )
  }
  throw error
}
\\\

### Handle Not Found

\\\	ypescript
try {
  const result = await atomicUpdate(filePath, async (items) => {
    const index = items.findIndex(i => i.id === id)
    if (index === -1) throw new Error('Item not found')
    // ... update logic
    return { updated, result }
  })
} catch (error) {
  if (error.message === 'Item not found') {
    return NextResponse.json(
      { success: false, error: 'Not found' },
      { status: 404 }
    )
  }
  throw error
}
\\\

---

## Testing Atomic Operations

### Unit Test Pattern

\\\	ypescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { atomicUpdate } from '@/lib/atomic-file-ops'

describe('atomicUpdate', () => {
  it('should update item atomically', async () => {
    const result = await atomicUpdate<Item[], Item>(testFile, async (items) => {
      const updated = [...items, newItem]
      return { updated, result: newItem }
    })
    
    expect(result).toEqual(newItem)
    
    // Verify file was written
    const content = JSON.parse(await fs.readFile(testFile, 'utf-8'))
    expect(content).toContainEqual(newItem)
  })
  
  it('should handle concurrent updates', async () => {
    const promises = Array.from({ length: 10 }, (_, i) => 
      atomicUpdate<Item[], Item>(testFile, async (items) => {
        const newItem = { id: i, value: i }
        const updated = [...items, newItem]
        return { updated, result: newItem }
      })
    )
    
    const results = await Promise.all(promises)
    expect(results).toHaveLength(10)
    
    // Verify all items saved
    const content = JSON.parse(await fs.readFile(testFile, 'utf-8'))
    expect(content).toHaveLength(10)
  })
})
\\\

---

## Monitoring & Debugging

### Check for Lock Issues

\\\ash
# List active locks
ls -la ~/.file-locks/

# Check lock age (stale detection)
stat ~/.file-locks/*.lock | grep Modify
\\\

### Debug Lock Contention

\\\	ypescript
import { cleanupStaleLocks } from '@/lib/file-lock'

// Run at startup to clean old locks
await cleanupStaleLocks()
\\\

### Performance Profiling

\\\	ypescript
const start = Date.now()
const result = await atomicUpdate(filePath, updateFn)
const duration = Date.now() - start
console.log(\Operation took \$\{duration}ms\)
\\\

---

## FAQ

**Q: How long does lock acquisition timeout?**
A: 30 seconds by default. Configurable in atomicUpdate options.

**Q: What if a process crashes while holding a lock?**
A: Stale lock cleanup detects it (age > timeout) and removes the lock.

**Q: Can multiple processes run atomicUpdate on same file?**
A: Yes, they queue up. Only one at a time holds the lock.

**Q: What if file doesn't exist?**
A: atomicRead returns [] or {}, atomicUpdate creates file if needed.

**Q: How do I test concurrent operations?**
A: Use Promise.all with multiple atomicUpdate calls. See test files.

**Q: What's the performance overhead?**
A: 1-5ms lock overhead + normal file I/O. Negligible for typical use.

**Q: Should I migrate to database?**
A: File locking works well for ~10-50 concurrent ops. Use DB for 100+.

---

## Troubleshooting

### "Failed to acquire lock" error
- **Cause**: Lock contention or stale lock
- **Solution**: Run cleanup or retry with backoff

### ".tmp files accumulating"
- **Cause**: Crashes during write
- **Solution**: Manual cleanup: \m /data/*.tmp\

### Performance degradation
- **Cause**: High contention on same file
- **Solution**: Split data into multiple files or use database

---

## Performance Tips

1. **Batch Updates**: Combine multiple updates into single atomicUpdate
2. **Read-Heavy**: Use atomicRead (no lock contention)
3. **Write-Heavy**: Consider database migration
4. **Large Files**: Increase timeout for slow disks

---

## Related Documentation

- RACE_CONDITION_FIX_IMPLEMENTATION.md - Detailed design
- IMPLEMENTATION_GUIDE.md - Comprehensive reference
- lib/file-lock.ts - Lock implementation
- lib/atomic-file-ops.ts - Atomic operations implementation

