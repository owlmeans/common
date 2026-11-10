export interface ComposedSignal {
  signal: AbortSignal
  /** Releases the timer and the listeners on the parent signals. */
  dispose: () => void
}

export interface SignalUtils {
  /**
   * One signal that aborts when any parent aborts (with its reason) or, given `timeoutMs`, when
   * the time runs out (with `reason()`).
   */
  compose: (signals: Array<AbortSignal | undefined>, timeoutMs?: number, reason?: () => Error) => ComposedSignal
  /** Throws the signal's reason when it already aborted. */
  throwIfAborted: (signal?: AbortSignal) => void
  /** Calls `listener` once when the signal aborts (in a microtask when it already did); answers the unsubscribe. */
  onAbort: (signal: AbortSignal | undefined, listener: (reason: unknown) => void) => () => void
}
