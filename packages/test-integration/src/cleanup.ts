type CleanupFn = () => void | Promise<void>

const queue: CleanupFn[] = []

/**
 * Register a cleanup function that `runCleanups()` will execute (LIFO).
 * Use from `tests/context.ts` `setup()` to schedule teardown of resources
 * that were provisioned for the suite (DB drop, key namespace flush,
 * uploaded objects).
 */
export const registerCleanup = (fn: CleanupFn): void => {
  queue.push(fn)
}

/**
 * Run all pending cleanup functions in reverse registration order.
 * Errors are swallowed and reported to stderr so a failing cleanup
 * cannot mask a test failure.
 */
export const runCleanups = async (): Promise<void> => {
  while (queue.length > 0) {
    const fn = queue.pop()
    if (fn == null) continue
    try {
      await fn()
    } catch (err) {
      console.error('@owlmeans/test-integration cleanup failed:', err)
    }
  }
}
