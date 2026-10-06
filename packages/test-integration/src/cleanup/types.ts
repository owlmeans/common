export interface CleanupFn { (): void | Promise<void> }

/** The opt-in teardown queue a suite's `tests/context.ts` fills and its `afterAll` drains. */
export interface CleanupHelper {
  /**
   * Register a cleanup function that {@link CleanupHelper.runCleanups} will execute (LIFO).
   * Use from `tests/context.ts` `setup()` to schedule teardown of resources
   * that were provisioned for the suite (DB drop, key namespace flush,
   * uploaded objects).
   */
  registerCleanup: (fn: CleanupFn) => void
  /**
   * Run all pending cleanup functions in reverse registration order.
   * Errors are swallowed and logged as warnings so a failing cleanup
   * cannot mask a test failure.
   */
  runCleanups: () => Promise<void>
}
