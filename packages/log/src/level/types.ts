import type { LogConsoleMode, LogFormat, LogLevel } from '../types.js'

/** Reads the logging policy out of whatever a config produced, and compares levels. */
export interface LogLevelHelper {
  /**
   * A level from whatever a config produced, or `fallback`. Config files give strings with a
   * trailing newline and arbitrary case; anything unknown (an unresolved `/etc/...` path included)
   * is not a level.
   */
  parseLogLevel: <F extends LogLevel | undefined>(value: unknown, fallback?: F) => LogLevel | F
  /** `text` or `json`, case- and whitespace-insensitive; anything else is `undefined`. */
  parseLogFormat: (value: unknown) => LogFormat | undefined
  /** `override` or `native`, case- and whitespace-insensitive; anything else is `undefined`. */
  parseLogConsole: (value: unknown) => LogConsoleMode | undefined
  /** `'a, b'`, `['a', 'b']` or `'*'` → the scope list; blank → none. */
  parseDebugScopes: (value: unknown) => string[] | undefined
  /** Whether a process running at `floor` writes a record at `level`. */
  levelAdmits: (floor: LogLevel, level: LogLevel) => boolean
}
