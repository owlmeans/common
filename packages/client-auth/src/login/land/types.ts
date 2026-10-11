import type { LoginLandingParams } from '../types.js'

/** Where a finished sign-in (or a pending step) lands. */
export interface LoginLanding {
  alias: string
  params?: LoginLandingParams
  query?: LoginLandingParams
  /** The step alias this landing came from, when it came from one. */
  step?: string
}

/** Options for {@link LoginService.landAfterLogin}-shaped helpers (./land.js). */
export interface LandOptions {
  /** Where to land when nothing else claims the flow. Defaults to `{ alias: HOME }`. */
  fallback?: LoginLanding
  /** `false` skips `resumeSuspendedFlow` — the caller already has its own concrete destination. */
  resume?: boolean
  /** Skip every step up to and including this alias — the resume point for a step's re-entry. */
  after?: string
  /**
   * Overrides the step/hook timeout for this call. Mainly for tests; production callers leave it
   * at the default (`LOGIN_STEP_TIMEOUT`).
   */
  stepTimeout?: number
}

/** Where one context's finished sign-in goes: its pending steps, a suspended flow, or the fallback. */
export interface LoginLandingHelper {
  /**
   * Where a finished sign-in should go: the first pending step, else a suspended flow, else the
   * fallback (ordinarily `HOME`).
   *
   * Re-checks `env().surrogate` even though {@link landAfterLogin} already did — this function is
   * also called directly (e.g. from `useContinueLogin`, after the surrogate window has already
   * closed), and the check is cheap insurance either way: **no step and no landing hook ever runs
   * inside the surrogate popup.** It has nothing of its own to collect and nowhere to navigate —
   * the popup's own `DispatcherHOC` has no `navigate() → HOME` at all.
   */
  continueLogin: (opts?: LandOptions) => Promise<LoginLanding>
  /**
   * The whole post-sign-in landing decision: run any due landing hooks for a freshly seen token,
   * then delegate to {@link continueLogin} for where the flow actually goes.
   *
   * This is what a plugin that just adopted a token calls in place of the old inline
   * "`resumeSuspendedFlow` else `HOME`" — `DispatcherHOC`, the supervisor plugin and both Google
   * plugins all replace their own copy of that logic with this one.
   */
  landAfterLogin: (opts?: LandOptions) => Promise<LoginLanding>
  /**
   * The absolute URL a landing resolves to — the same shape the supervisor and Google plugins
   * already build their own `window.location.href` from.
   */
  landingUrl: (landing: LoginLanding) => Promise<string>
}
