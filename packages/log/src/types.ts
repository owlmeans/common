import type { BasicConfig } from '@owlmeans/context'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

export type LogFormat = 'text' | 'json'

/** `override` replaces the global `console` with the logger's own commands; `native` leaves it alone. */
export type LogConsoleMode = 'override' | 'native'

/**
 * What a deployment decides about logging.
 *
 * Every field also accepts the raw string a config file resolves to (`'info'`, `'a,b'`), so the
 * object can sit in a config whose leaves are paths read by the file reader. A value that does not
 * parse is ignored — the previous setting stays.
 */
export interface LogConfig {
  /** The lowest level written. */
  level?: LogLevel | string
  /** Scopes that log at `debug` whatever the level is: `'*'`, or `'agent,jobs:queue'`. */
  debug?: string | string[]
  format?: LogFormat | string
  console?: LogConsoleMode | string
}

declare module '@owlmeans/context' {
  interface BasicConfig {
    /** Logging policy of this process — see `@owlmeans/log`. */
    log?: LogConfig
  }
}

/**
 * How one call is routed.
 *
 * A call goes to the console sink (and to the plugins' `log`) unless `console` is `false`; it goes
 * to the analytics plugins' `track` when `analytics` is set. The two are independent: an analytics
 * call needs no level, and a console call needs no event.
 */
export interface LogOptions {
  /** A stable machine name (`job.start`, `subscription.started`, `access.forbidden`). */
  event?: string
  /** Also hand the call to analytics plugins. A string names the event, like `event`. */
  analytics?: boolean | string
  /** `false` keeps the call out of the console sink and the plugins' `log`. */
  console?: boolean
}

export interface LogRecord {
  level: Exclude<LogLevel, 'silent'>
  scope: string
  message: string
  time: number
  /** Redacted, size-capped structured data. */
  data?: unknown
  event?: string
  /** The `Error` the call carried, kept as an object so a sink can hand it on intact. */
  error?: Error
}

export interface AnalyticsEvent {
  event: string
  scope: string
  time: number
  level: Exclude<LogLevel, 'silent'>
  message: string
  data?: unknown
}

/**
 * A destination for what is logged. Analytics systems, a target's link to the platform, a file or
 * a test's memory are all plugins. A plugin that throws is skipped: logging never breaks work.
 */
export interface LogPlugin {
  name: string
  /** Every record the level filter admitted. */
  log?: (record: LogRecord) => void
  /** Every call that asked for analytics. The plugin filters for itself. */
  track?: (event: AnalyticsEvent) => void
  install?: () => void
  uninstall?: () => void
}

export type LogMethod = (message: string | Error, data?: unknown, options?: LogOptions) => void

export interface Logger {
  readonly scope: string
  debug: LogMethod
  info: LogMethod
  warn: LogMethod
  error: LogMethod
  /** A logger of `<scope>:<name>` that adds `data` to every call. */
  child: (name: string, data?: Record<string, unknown>) => Logger
  /** Whether a record at `level` would be written now — guard a costly argument with it. */
  enabled: (level?: LogLevel) => boolean
}

export type { BasicConfig }
