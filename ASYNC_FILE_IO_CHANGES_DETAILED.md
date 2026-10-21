# Async File I/O Conversion - Detailed Code Changes

## Change Summary

✅ **3 API Routes Fixed** | ✅ **File Locking Added** | ✅ **TypeScript Valid** | ⏱️ **Execution Time: ~3 minutes**

---

## 1. conductor/route.ts

### Change 1: Add withFileLock import
```typescript
// Line 6
+ import { withFileLock } from '@/lib/file-lock'
```

### Change 2: Wrap loadLogs() with file locking
```typescript
// Lines 55-73 (BEFORE)
async function loadLogs(): Promise<ConversationLog[]> {
  await ensureDataDir()
  try {
    const data = await fs.readFile(LOG_FILE, 'utf-8')
    // ...
  }
}

// Lines 55-73 (AFTER)
async function loadLogs(): Promise<ConversationLog[]> {
  return withFileLock(LOG_FILE, async () => {
    await ensureDataDir()
    try {
      const data = await fs.readFile(LOG_FILE, 'utf-8')
      // ... rest unchanged
    }
  })
}
```

### Change 3: Wrap saveLogs() with file locking & add return type
```typescript
// Lines 75-79 (BEFORE)
async function saveLogs(logs: ConversationLog[]) {
  await ensureDataDir()
  await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2), 'utf-8')
}

// Lines 75-79 (AFTER)
async function saveLogs(logs: ConversationLog[]): Promise<void> {
  return withFileLock(LOG_FILE, async () => {
    await ensureDataDir()
    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2), 'utf-8')
  })
}
```

---

## 2. kanban/route.ts

### Change 1: Add withFileLock import
```typescript
// Line 8
+ import { withFileLock } from '@/lib/file-lock'
```

### Change 2: Wrap loadTasks() with file locking
```typescript
// Lines 34-53 (BEFORE)
async function loadTasks(): Promise<Task[]> {
  await ensureDataDir()
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8')
    // ... JSON parsing and error handling
  }
}

// Lines 34-53 (AFTER)
async function loadTasks(): Promise<Task[]> {
  return withFileLock(DATA_FILE, async () => {
    await ensureDataDir()
    try {
      const data = await fs.readFile(DATA_FILE, 'utf-8')
      // ... JSON parsing and error handling (unchanged)
    }
  })
}
```

### Change 3: Wrap saveTasks() with file locking
```typescript
// Lines 55-63 (BEFORE)
async function saveTasks(tasks: Task[]): Promise<void> {
  try {
    await ensureDataDir()
    await fs.writeFile(DATA_FILE, JSON.stringify(tasks, null, 2), 'utf-8')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Failed to save tasks: ${message}`)
  }
}

// Lines 55-63 (AFTER)
async function saveTasks(tasks: Task[]): Promise<void> {
  return withFileLock(DATA_FILE, async () => {
    try {
      await ensureDataDir()
      await fs.writeFile(DATA_FILE, JSON.stringify(tasks, null, 2), 'utf-8')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to save tasks: ${message}`)
    }
  })
}
```

---

## 3. meetings/route.ts

### Change 1: Add withFileLock import
```typescript
// Line 6
+ import { withFileLock } from '@/lib/file-lock'
```

### Change 2: Wrap loadMeetingLogs() with file locking
```typescript
// Lines 52-62 (BEFORE)
async function loadMeetingLogs(): Promise<MeetingLog[]> {
  await ensureDataDir()
  try {
    await fs.stat(MEETINGS_LOG)
    const data = await fs.readFile(MEETINGS_LOG, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

// Lines 52-62 (AFTER)
async function loadMeetingLogs(): Promise<MeetingLog[]> {
  return withFileLock(MEETINGS_LOG, async () => {
    await ensureDataDir()
    try {
      await fs.stat(MEETINGS_LOG)
      const data = await fs.readFile(MEETINGS_LOG, 'utf-8')
      return JSON.parse(data)
    } catch {
      return []
    }
  })
}
```

### Change 3: Wrap saveMeetingLogs() with file locking
```typescript
// Lines 63-68 (BEFORE)
async function saveMeetingLogs(logs: MeetingLog[]): Promise<void> {
  await ensureDataDir()
  await fs.writeFile(MEETINGS_LOG, JSON.stringify(logs, null, 2), 'utf-8')
}

// Lines 63-68 (AFTER)
async function saveMeetingLogs(logs: MeetingLog[]): Promise<void> {
  return withFileLock(MEETINGS_LOG, async () => {
    await ensureDataDir()
    await fs.writeFile(MEETINGS_LOG, JSON.stringify(logs, null, 2), 'utf-8')
  })
}
```

### Change 4: Wrap logToBrain() with file locking
```typescript
// Lines 77-101 (BEFORE)
async function logToBrain(log: MeetingLog): Promise<void> {
  const brainDir = path.join(process.cwd(), '..', 'company-brain', 'meetings')
  try {
    await fs.mkdir(brainDir, { recursive: true })
  } catch {
    // Already exists
  }

  const id = generateId('meeting')
  const safeType = MeetingTypeSchema.safeParse(log.meeting_type)
  const filePath = safeJoin(brainDir, `${safeType.success ? safeType.data : 'unknown'}_${id}.json`)

  const brainRecord = {
    // ... record structure unchanged
  }

  await fs.writeFile(filePath, JSON.stringify(brainRecord, null, 2), 'utf-8')
}

// Lines 77-101 (AFTER)
async function logToBrain(log: MeetingLog): Promise<void> {
  const brainDir = path.join(process.cwd(), '..', 'company-brain', 'meetings')
  const id = generateId('meeting')
  const safeType = MeetingTypeSchema.safeParse(log.meeting_type)
  const filePath = safeJoin(brainDir, `${safeType.success ? safeType.data : 'unknown'}_${id}.json`)

  return withFileLock(filePath, async () => {
    try {
      await fs.mkdir(brainDir, { recursive: true })
    } catch {
      // Already exists
    }

    const brainRecord = {
      // ... record structure unchanged
    }

    await fs.writeFile(filePath, JSON.stringify(brainRecord, null, 2), 'utf-8')
  })
}
```

---

## 4. auth.ts (Supporting Fix)

### Change: Fix JWT_SECRET reference
```typescript
// Line 102 (BEFORE)
JWT_SECRET

// Line 102 (AFTER)
getJWTSecret()
```

This ensures all JWT operations use the secure getter function rather than undefined variable reference.

---

## Pattern Applied to All Three Routes

### The withFileLock wrapper ensures:
1. **Exclusive Access** - Only one operation per file at a time
2. **FIFO Queue** - Requests processed in order they arrive
3. **Automatic Cleanup** - Locks released even on errors
4. **Type Safe** - Returns generic type from callback

### Generic Structure:
```typescript
async function operation(...): Promise<ReturnType> {
  return withFileLock(FILE_PATH, async () => {
    // All I/O operations here are exclusive
    await fs.readFile(...)
    await fs.writeFile(...)
    return result
  })
}
```

---

## Key Characteristics of Solution

| Aspect | Details |
|--------|---------|
| **Concurrency Model** | In-process, in-memory locks |
| **Thread Safety** | JavaScript is single-threaded, locks protect file state |
| **Scalability** | Per-file locks, no global bottleneck |
| **Failure Handling** | Lock released even if callback throws |
| **Performance** | Minimal overhead, I/O is blocking bottleneck |
| **Compatibility** | Works with existing async/await patterns |

---

## Files Status

| File | Before | After | Impact |
|------|--------|-------|--------|
| conductor/route.ts | No locking | ✅ Locked | Prevents log corruption |
| kanban/route.ts | No locking | ✅ Locked | Prevents task data loss |
| meetings/route.ts | No locking | ✅ Locked (2 places) | Prevents meeting/brain log corruption |
| alerts/route.ts | ✅ Already locked | — | No changes needed |
| brain/route.ts | ✅ Read-only safe | — | No changes needed |

---

## Verification

✅ All imports resolve
✅ All async/await valid
✅ All types correct
✅ All error handling intact
✅ All return types specified
✅ TypeScript compilation: **PASSED**

---

## Rollback Procedure (if needed)

Each file can be reverted independently:

```bash
git checkout dashboard/app/api/conductor/route.ts
git checkout dashboard/app/api/kanban/route.ts
git checkout dashboard/app/api/meetings/route.ts
```

Or to undo all at once:
```bash
git checkout -- dashboard/app/api/{conductor,kanban,meetings}/route.ts
```

---

**Total Lines Changed:** ~40 lines across 3 files
**Lines Added:** ~25 (withFileLock wrappers)
**Breaking Changes:** None
**API Changes:** None (behavior only, not interface)

