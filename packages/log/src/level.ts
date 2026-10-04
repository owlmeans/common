import { LEVEL_RANK, LOG_LEVELS } from './consts.js'
import type { LogConsoleMode, LogFormat, LogLevel } from './types.js'

/**
 * A level from whatever a config produced, or `fallback`. Config files give strings with a
 * trailing newline and arbitrary case; anything unknown (an unresolved `/etc/...` path included)
 * is not a level.
 */
export const parseLogLevel = <F extends LogLevel | undefined>(value: unknown, fallback?: F): LogLevel | F => {
  if (typeof value === 'string') {
    const level = value.trim().toLowerCase()
    if (level === 'warning') {
      return 'warn'
    }
    if ((LOG_LEVELS as string[]).includes(level)) {
      return level as LogLevel
    }
  }
  return fallback as F
}

export const parseLogFormat = (value: unknown): LogFormat | undefined => {
  const format = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return format === 'text' || format === 'json' ? format : undefined
}

export const parseLogConsole = (value: unknown): LogConsoleMode | undefined => {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return mode === 'override' || mode === 'native' ? mode : undefined
}

/** `'a, b'`, `['a', 'b']` or `'*'` → the scope list; blank → none. */
export const parseDebugScopes = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    return value.filter((scope): scope is string => typeof scope === 'string').map(scope => scope.trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    // An unresolved path is not a scope list.
    if (value.trim().startsWith('/')) {
      return undefined
    }
    return value.split(',').map(scope => scope.trim()).filter(Boolean)
  }
  return undefined
}

export const levelAdmits = (floor: LogLevel, level: LogLevel): boolean => LEVEL_RANK[level] >= LEVEL_RANK[floor]
