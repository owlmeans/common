import type { LoginEnv } from '../types.js'

/** What this browsing context is for a sign-in: framed, the surrogate window, opened by another. */
export interface LoginEnvHelper {
  /**
   * Whether this document is embedded in a frame.
   *
   * Reading `window.top` across origins throws, and that throw is itself the answer: a `top` that
   * differs and a `top` that cannot be reached both mean "framed".
   */
  isEmbedded: () => boolean
  /**
   * Record that this window is the surrogate login window, while that is still knowable.
   *
   * Must run on the surrogate's **first** load, before the flow navigates to the provider:
   * `window.name` is the only evidence at that point, and browsers clear it as soon as a top-level
   * context goes cross-origin — so by the time the provider redirects back, the name is gone and
   * this window would look like an ordinary tab.
   *
   * Idempotent, and a no-op in every window that is not the surrogate.
   */
  markSurrogate: () => void
  /** Whether this document is the surrogate login window. */
  isSurrogate: () => boolean
  /** Forget the surrogate marker — called once its token has been handed back. */
  clearSurrogate: () => void
  /**
   * Default login environment.
   *
   * The single source of environment truth for cascade selection — a plugin's `match` reads this
   * and never probes `window` itself, so a non-DOM host can drive the same plugins by supplying its
   * own descriptor.
   */
  defaultLoginEnv: () => LoginEnv
}
