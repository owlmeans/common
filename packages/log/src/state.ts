import { DEFAULT_LOG_LEVEL, STATE_KEY } from './consts.js'
import type { LogConsoleMode, LogFormat, LogLevel, LogPlugin } from './types.js'

export type ConsoleMethod = 'debug' | 'log' | 'info' | 'warn' | 'error' | 'trace'

export type NativeConsole = Record<ConsoleMethod, (...args: unknown[]) => void>

export interface LogState {
  level: LogLevel
  /** `'*'` or the scopes forced to `debug`. */
  debugScopes: string[]
  format: LogFormat
  consoleMode: LogConsoleMode
  plugins: LogPlugin[]
  /** The console as it was before anything of ours touched it. */
  native: NativeConsole
  overridden: boolean
  throttles: Map<string, number>
}

const captureNative = (): NativeConsole => {
  const source = (typeof console !== 'undefined' ? console : {}) as Partial<Record<ConsoleMethod, (...args: unknown[]) => void>>
  const bind = (method: ConsoleMethod): ((...args: unknown[]) => void) => {
    const fn = source[method] ?? source.log
    return typeof fn === 'function' ? fn.bind(source) : () => undefined
  }
  return {
    debug: bind('debug'), log: bind('log'), info: bind('info'),
    warn: bind('warn'), error: bind('error'), trace: bind('trace'),
  }
}

/**
 * The one state of the process. It hangs off `globalThis` under a registry symbol so that two
 * copies of this module (a bundler that failed to dedupe, a linked workspace) share one level, one
 * plugin list and — above all — ONE captured native console: a second copy capturing the already
 * overridden console would make the override call itself.
 */
export const state = (): LogState => {
  const holder = globalThis as unknown as Record<symbol, LogState | undefined>
  let current = holder[STATE_KEY]
  if (current == null) {
    current = {
      level: DEFAULT_LOG_LEVEL,
      debugScopes: [],
      format: 'text',
      consoleMode: 'override',
      plugins: [],
      native: captureNative(),
      overridden: false,
      throttles: new Map(),
    }
    holder[STATE_KEY] = current
  }
  return current
}

/** The captured console. Mutable on purpose: a test replaces a method to read what the sink wrote. */
export const nativeConsole = (): NativeConsole => state().native

export const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined'
