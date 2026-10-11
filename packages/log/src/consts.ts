import type { LogLevel } from './types.js'

/** Severity rank of every level; `silent` is above everything, so it admits nothing. */
export const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
}

export const LOG_LEVELS = Object.keys(LEVEL_RANK) as LogLevel[]

/** The level a process runs at until something configures it. */
export const DEFAULT_LOG_LEVEL: LogLevel = 'info'

/** The scope of every line that arrived through the overridden `console`. */
export const CONSOLE_SCOPE = 'console'

/** What a redacted value is replaced with. */
export const REDACTED = '[redacted]'

/**
 * Keys whose values are never written to any sink. `token` counts only as the END of a key
 * (`token`, `accessToken`, `id_token`): `maxTokens`, `tokens` and `tokenCount` are numbers about
 * usage, not credentials.
 */
export const SECRET_KEY = /secret|passw(or)?d|authorization|cookie|api[-_]?key|credential|private|signature|\bpk\b|token$/i

/** The longest string a record keeps; the rest is cut. */
export const MAX_STRING = 2000

/** Deepest object nesting a record keeps. */
export const MAX_DEPTH = 4

/** The key of the process-wide state on `globalThis` (shared by duplicate module copies). */
export const STATE_KEY = Symbol.for('owlmeans.log.state')
