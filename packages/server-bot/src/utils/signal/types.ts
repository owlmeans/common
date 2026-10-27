/** The abort signals every platform API client builds its calls with — one deadline, one wait. */
export interface SignalUtils {
  /** One signal that aborts when the caller's does or when the call's own time is up. */
  deadline: (timeoutMs: number, signal?: AbortSignal) => AbortSignal
  /**
   * Wait `ms` (a rate limit's `retry_after`); an abort rejects at once with the signal's reason —
   * the caller's abort wins over the wait. Nothing to wait for (`ms <= 0`) resolves at once.
   */
  pause: (ms: number, signal?: AbortSignal) => Promise<void>
}
