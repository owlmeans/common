import { logger } from '@owlmeans/log'
import type { CleanupFn, CleanupHelper } from './cleanup/types.js'

const log = logger('test-integration')

// Process-wide on purpose: every spec file of a run registers into, and drains, the same queue.
const queue: CleanupFn[] = []

export const createCleanupHelper = (): CleanupHelper => {
  const registerCleanup = (fn: CleanupFn): void => {
    queue.push(fn)
  }

  const runCleanups = async (): Promise<void> => {
    while (queue.length > 0) {
      const fn = queue.pop()
      if (fn == null) continue
      try {
        await fn()
      } catch (err) {
        log.warn('Cleanup failed', err)
      }
    }
  }

  return { registerCleanup, runCleanups }
}

export const cleanupHelper = createCleanupHelper()

/** @deprecated compat:factory-refactor — use `cleanupHelper.registerCleanup(…)` */
export const registerCleanup = (fn: CleanupFn): void => cleanupHelper.registerCleanup(fn)

/** @deprecated compat:factory-refactor — use `cleanupHelper.runCleanups()` */
export const runCleanups = async (): Promise<void> => await cleanupHelper.runCleanups()
