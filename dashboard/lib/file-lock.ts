interface FileLock {
  queue: Array<() => Promise<void>>
  locked: boolean
}

const locks = new Map<string, FileLock>()

export async function withFileLock<T>(filePath: string, callback: () => Promise<T>): Promise<T> {
  let lock = locks.get(filePath)
  
  if (!lock) {
    lock = { queue: [], locked: false }
    locks.set(filePath, lock)
  }

  return new Promise((resolve, reject) => {
    const executeCallback = async () => {
      try {
        const result = await callback()
        resolve(result)
      } catch (error) {
        reject(error)
      } finally {
        const nextCallback = lock!.queue.shift()
        if (nextCallback) {
          await nextCallback()
        } else {
          lock!.locked = false
        }
      }
    }

    if (lock.locked) {
      lock.queue.push(executeCallback)
    } else {
      lock.locked = true
      executeCallback()
    }
  })
}
