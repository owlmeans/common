import type { ConnectorApi, LocalExecutor, OpenSessionArgs } from '../types.js'

export interface SessionOptions {
  api: ConnectorApi
  open: OpenSessionArgs
  /** Absent for a cloud target: the platform's own pod executes its commands. */
  executor?: LocalExecutor
  /** Which deployment this is, recorded in the project's marker so a later connector finds it. */
  apiUrl?: string
  /**
   * Whether this connector performs the platform's model calls at all. `false` (a plugin edition):
   * a model-task operation is never queued for the parent — it is answered once, `Unavailable`
   * (the run stops rather than retrying against a connector that never will), and logged. `true` when
   * absent — every model task is delivered, as always.
   */
  modelTasks?: boolean
  log?: (line: string) => void
}

export interface Waiting<T> {
  resolve: (item: T | null) => void
  timer: ReturnType<typeof setTimeout>
}

/** A caller told when an item is queued, without taking it. */
export interface Watching {
  resolve: (ready: boolean) => void
  timer: ReturnType<typeof setTimeout>
}
