/** The ordinary flow: leave for the provider and come back. */
export const REDIRECT_LOGIN = 'owlmeans-redirect-login'

/** The flow that runs one window up, for a document that cannot redirect where it is. */
export const SURROGATE_LOGIN = 'owlmeans-surrogate-login'

/**
 * Registered above the default so it wins the cascade wherever it applies. It applies narrowly —
 * only in a frame, or in the surrogate window itself — so the default still serves every
 * ordinary tab.
 */
export const SURROGATE_LOGIN_PRIORITY = 100

/** What the surrogate window is doing, from the point of view of the person watching it. */
export enum SurrogateStage {
  /** Working. No control — there is nothing for the user to do but wait. */
  Working = 'working',
  /** Needs a click: the flow cannot continue without a fresh gesture. */
  Gesture = 'gesture',
  /** Done here; handing the result back and closing. */
  Handing = 'handing',
  /** Acted, but with no channel back to the window that asked. */
  Orphaned = 'orphaned',
  /** Ended with nothing. */
  Failed = 'failed',
  /** Not a surrogate at all — someone opened this address directly. */
  Standalone = 'standalone',
}

/**
 * The login window an embedded application opens one level up.
 *
 * It is NOT wrapped in `DispatcherHOC`, and that is the point: the HOC's continuation navigates to
 * `HOME` when it has nothing else to do, which is how a popup ended up rendering the whole
 * application, with its navigation, inside itself. This screen has no continuation at all — it
 * either hands something back and closes, or it says what it is waiting for.
 *
 * It also never runs the authorization machine itself: it forwards to the dispatcher (`next`),
 * which owns that flow, and hands back what the dispatcher issued — see {@link surrogateLoginStep}
 * for why a session already stored in this window is not simply handed back.
 */
/** What a surrogate window opened to SIGN IN does with the session it may already hold. */
export enum SurrogateLoginStep {
  /** Drop the stored session and authenticate afresh through the dispatcher. */
  Forget = 'forget',
  /** Hand the stored session to the opener — there is no dispatcher to authenticate through. */
  Resume = 'resume',
  /** Nothing stored: authenticate through the dispatcher. */
  Authenticate = 'authenticate',
}
