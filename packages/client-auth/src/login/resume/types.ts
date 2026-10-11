import type { LoginOutcome, ResumeAction } from '../consts.js'

/** How a settled sign-in outcome is read: by a screen that stayed put, and by a resuming dispatcher. */
export interface LoginResumeHelper {
  /**
   * The message key a FINISHED sign-in attempt should show, or null when it actually went somewhere.
   *
   * A dispatcher may treat `Passed` as "carry on with the ordinary continuation", because it has one.
   * A screen does not: the user clicked, the document did not move, and nothing rendered — which is
   * indistinguishable from a broken button, and is exactly how a null authorization URL used to
   * present itself. Every outcome that leaves the user looking at the same screen therefore has to
   * say something.
   */
  loginAttemptError: (outcome: LoginOutcome | null) => string | null
  /**
   * The one reading of a `resume` outcome, shared by every dispatcher.
   *
   * Shared because three dispatchers — `web-client`, `web-oidc-rp` and `mui-oidc-rp` — have to agree
   * on it, and the last time they each held their own copy of a decision they drifted, which is how a
   * popup came to render the application inside itself in two packages at once. It is also the whole
   * rule, so it is testable without a DOM.
   */
  resumeAction: (outcome: LoginOutcome) => ResumeAction
}
