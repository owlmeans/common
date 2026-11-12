

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
  /** main's api — the only api of a one-app tree, and what every older reader reads. */
  api?: LocalProcessRecord
  worker?: LocalProcessRecord
  /** The process serving the built browser app — this connector itself, not a child. */
  web?: LocalProcessRecord
  /**
   * Every app of a SPLIT project, `main` first, then by index — each with its own api (main's is
   * {@link api} again). Absent for a one-app tree, so its record reads exactly as before apps.
   */
  apps?: LocalRunApp[]
}

/** One app of a split project's local run: who it is, and the api process serving it. */
export interface LocalRunApp {
  name: string
  mount: string
  index: number
  /** Absent when the app's api had no build output to start. */
  api?: LocalProcessRecord
}

/** Where one app of a split project answers locally — all of them on the one web port. */
export interface LocalAppAddress {
  name: string
  mount: string
  /** `http://localhost:5173/<mount>/` — `/` for main. */
  url: string
  /** The app's own api port (`3000 + 10·index`), proxied at `<mount>/api` on the web port. */
  api: number
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
  /** Every app of a split project and where it answers; absent for a one-app tree. */
  apps?: LocalAppAddress[]
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
  /** Every app of a split project's run, `main` first; absent for a one-app tree. */
  apps?: LocalAppStatus[]
}

/** One app of a split project's run, as a status read finds its api. */
export interface LocalAppStatus extends LocalAppAddress {
  /** The app's api process is alive. */
  alive: boolean
  /** Its api says it is serving — the same health answer main's `ready` is. */
  ready: boolean
  phase?: string
  /** Why it is not ready; absent when it is. */
  reason?: string
}

export interface LocalServer {
  listen: (port?: number, host?: string) => Promise<void>
  close: () => Promise<void>
  port: number
}

export interface LocalServerOptions {
  /** Where the target's api answers. The proxy target, not something the browser ever sees. */
  apiPort?: number
  /**
   * The apps of a split project, served by mount on the one port: `/<mount>/api(/…)` proxied to that
   * app's api (the path kept), `/<mount>(/…)` from its own build with the SPA fallback, longest mount
   * first, and `/` main's. Absent (or main alone): the one app, exactly as before apps.
   */
  apps?: LocalAppRoute[]
}

/** One app the local server routes to. */
export interface LocalAppRoute {
  name: string
  /** One path segment, `''` for main. */
  mount: string
  /** The app's api port — its proxy target. */
  apiPort: number
  /** The app's built browser directory, read per request (a re-initialization may move it). */
  webDir: () => string
}
