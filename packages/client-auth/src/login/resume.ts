import { LoginOutcome } from './types.js'

/**
 * The message key a FINISHED sign-in attempt should show, or null when it actually went somewhere.
 *
 * A dispatcher may treat `Passed` as "carry on with the ordinary continuation", because it has one.
 * A screen does not: the user clicked, the document did not move, and nothing rendered — which is
 * indistinguishable from a broken button, and is exactly how a null authorization URL used to
 * present itself. Every outcome that leaves the user looking at the same screen therefore has to
 * say something.
 */
export const loginAttemptError = (outcome: LoginOutcome | null): string | null => {
  switch (outcome) {
    case LoginOutcome.Gesture:
      // The window never opened. That is the popup blocker, and it has its own copy.
      return 'login.error.blocked'
    case LoginOutcome.Failed:
    case LoginOutcome.Passed:
      return 'login.error.failed'
    default:
      // Handled, Redirected and Orphaned all did something; Orphaned reports itself elsewhere.
      return null
  }
}

/** What a dispatcher does once `login().resume(...)` has answered. */
export enum ResumeAction {
  /** The plugin took it over — the browser is leaving, or the window is closing. */
  Stop = 'stop',
  /** Render the outcome to the user; there is nothing further to do automatically. */
  Render = 'render',
  /** Ordinary tab: keep the session and carry on to the application. */
  Navigate = 'navigate',
}

/**
 * The one reading of a `resume` outcome, shared by every dispatcher.
 *
 * Exported as a pure function because three dispatchers — `web-client`, `web-oidc-rp` and
 * `mui-oidc-rp` — have to agree on it, and the last time they each held their own copy of a
 * decision they drifted, which is how a popup came to render the application inside itself in two
 * packages at once. It is also the whole rule, so it is testable without a DOM.
 */
export const resumeAction = (outcome: LoginOutcome): ResumeAction => {
  switch (outcome) {
    case LoginOutcome.Handled:
    case LoginOutcome.Redirected:
      return ResumeAction.Stop
    case LoginOutcome.Orphaned:
    case LoginOutcome.Failed:
    case LoginOutcome.Gesture:
      return ResumeAction.Render
    default:
      return ResumeAction.Navigate
  }
}
