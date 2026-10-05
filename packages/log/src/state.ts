import { DEFAULT_LOG_LEVEL, STATE_KEY } from './consts.js'
import type { ConsoleMethod, LogState, NativeConsole } from './types.js'
import type { LogStateHelper } from './state/types.js'

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

export const createLogStateHelper = (): LogStateHelper => {
  const state = (): LogState => {
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

  const nativeConsole = (): NativeConsole => state().native

  const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined'

  return { state, nativeConsole, isBrowser }
}

export const logStateHelper = createLogStateHelper()

/** @deprecated compat:factory-refactor — use `logStateHelper.nativeConsole()` */
export const nativeConsole = (): NativeConsole => logStateHelper.nativeConsole()
