import type { LogState, NativeConsole } from '../types.js'

/** The process-wide log state and the environment the log writes to. */
export interface LogStateHelper {
  /**
   * The one state of the process. It hangs off `globalThis` under a registry symbol so that two
   * copies of this module (a bundler that failed to dedupe, a linked workspace) share one level, one
   * plugin list and — above all — ONE captured native console: a second copy capturing the already
   * overridden console would make the override call itself.
   */
  state: () => LogState
  /** The captured console. Mutable on purpose: a test replaces a method to read what the sink wrote. */
  nativeConsole: () => NativeConsole
  /** Whether the process runs in a browser (a `window` and a `document` exist). */
  isBrowser: () => boolean
}
