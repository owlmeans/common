

export interface RunLocalOptions {
  /** Build before starting. On by default — starting a stale `dist/` is the confusing failure. */
  build?: boolean
  log?: (line: string) => void
}

export interface LocalProcessRecord {
  pid: number
  port: number
  /**
   * The id this instance answers `/api/healtz` with.
   *
   * Port ownership is a restart's only proof: the child is a shell wrapping `bun`, so a signal
   * the shell dies from and `bun` survives leaves an orphan holding the port while the exit
   * handler says "gone". A replacement then loses the bind and exits — and since a failed
   * `listen` announces nothing on its own, everything keeps reporting healthy while the older
   * build is what is being served.
   */
  bootId?: string
}

export interface LocalRunRecord {
  dir: string
  startedAt: string
  api?: LocalProcessRecord
  worker?: LocalProcessRecord
  /** The process serving the built browser app — this connector itself, not a child. */
  web?: LocalProcessRecord
}

export interface RunLocalResult {
  record: LocalRunRecord | null
  /**
   * The ports the run uses, so a caller can print an address without composing one.
   *
   * Stated even when a process did not come up: they are where the app WILL answer, and whether
   * it does yet is what `error`, `buildError` and `localStatus` are for.
   */
  api: number
  web: number
  worker?: number
  /** The reason nothing was started, or the tree was refused. */
  error?: string
  /** A build ran and failed. The web server still comes up so the state is visible. */
  buildError?: string
}

/** One supervised process, as a status read finds it. */
export interface LocalProcessStatus {
  pid: number
  port: number
  alive: boolean
}

export interface LocalRunStatus {
  running: boolean
  startedAt?: string
  /** Ports, flat, for a caller composing an address or a one-line report. */
  api?: number
  worker?: number
  web?: number
  /** The target's own boot phase, when it got far enough to report one. */
  phase?: string
  /** Whether the target says it is serving — never the same question as "the pid is alive". */
  ready?: boolean
  /** Why it is not ready. Absent when it is. */
  reason?: string
  processes: {
    api?: LocalProcessStatus
    worker?: LocalProcessStatus
    web?: LocalProcessStatus
  }
}

export interface LocalServer {
  listen: (port?: number, host?: string) => Promise<void>
  close: () => Promise<void>
  port: number
}

export interface LocalServerOptions {
  /** Where the target's api answers. The proxy target, not something the browser ever sees. */
  apiPort?: number
}
