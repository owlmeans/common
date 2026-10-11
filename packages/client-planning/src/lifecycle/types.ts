/** One captured authenticated generation; cancellation does not undo a server write. */
export interface PlanningOperation {
  key: string
  signal: AbortSignal
  active: () => boolean
  check: () => void
  wait: <T>(pending: Promise<T>) => Promise<T>
  cancel: (reason?: Error) => void
  release: () => void
}

/** Shared cancellation and the boundary between local mirror mutations and clearing. */
export interface PlanningClientLifecycle {
  key: () => string
  capture: (expected?: string) => PlanningOperation
  run: <T>(work: (operation: PlanningOperation) => Promise<T>) => Promise<T>
  /** Local store operations only: never hold this queue over an RPC or a socket opener. */
  mutate: <T>(operation: PlanningOperation, work: () => Promise<T>) => Promise<T>
  drain: () => Promise<void>
  onInvalidate: (listener: () => void | Promise<void>) => () => void
  close: () => Promise<void>
}

export interface PlanningClientLifecycleOptions {
  scopeKey?: () => string | undefined
  /** Runs in the mutation queue after admitted old writes have drained. */
  clear?: () => Promise<void>
}
