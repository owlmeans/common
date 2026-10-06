import type { ConnectorApi, LocalExecutor, OpenSessionArgs } from '../types.js'

export interface SessionOptions {
  api: ConnectorApi
  open: OpenSessionArgs
  /** Absent for a cloud target: the platform's own pod executes its commands. */
  executor?: LocalExecutor
  /** Which deployment this is, recorded in the project's marker so a later connector finds it. */
  apiUrl?: string
  log?: (line: string) => void
}

export interface Waiting<T> {
  resolve: (item: T | null) => void
  timer: ReturnType<typeof setTimeout>
}
