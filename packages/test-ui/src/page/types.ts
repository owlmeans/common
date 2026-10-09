export interface AnswerMarketingConsentOptions {
  /**
   * Which choice to save when the step is shown. `'all'` (the default) ticks the "select all"
   * checkbox (every consent, and the Terms row while it is up — see {@link terms} for what is left
   * of that) before saving; `'none'` saves with every item left unchecked, which is a valid,
   * fully-compliant state on its own; `'skip'` clicks "Skip for now" instead of saving anything —
   * only valid when a Terms box is not on screen (nothing calls it there; see {@link terms}).
   */
  accept?: 'none' | 'all' | 'skip'
  /**
   * When a Terms row is on screen (`appendMarketingConsent({ terms: 'step' })`), `'accept'` (the
   * default) ends with it ticked. `'leave'` ends with it unticked, even after a select-all — for a
   * spec that means to drive the blocked state itself; the confirm click below still fires (with `{ force: true }`, since
   * the control is never truly `disabled`), and this helper then EXPECTS the box to still be up
   * afterward rather than treating that as a failure.
   */
  terms?: 'accept' | 'leave'
  timeout?: number
}

/** What {@link PageHelper.acceptConsent} waits for. */
export interface AcceptConsentOptions {
  /** How long the dialog may take to appear, and then to go away. Defaults to 5s. */
  timeout?: number
}

export interface DispatcherLoginOptions {
  dispatcherPath?: string
  /** What counts as "arrived" for the navigation. Defaults to `domcontentloaded` — see `MountOptions.waitUntil`. */
  waitUntil?: 'commit' | 'domcontentloaded' | 'load' | 'networkidle'
  /**
   * Answer the marketing-consent step if it is shown right after the dispatcher navigates away.
   * Defaults to `'save'` (select-all and save) — see {@link PageHelper.answerMarketingConsent}. Pass
   * `'ignore'` to skip the call entirely, e.g. in a spec that answers the step itself.
   */
  marketingConsent?: 'save' | 'ignore'
}

export interface SupervisorFormLoginOptions {
  baseUrl: string
  /** Target user id / email. */
  userId: string
  /** Supervisor private key (e.g. `ed25519:<base64>` from `.env.dev.secrets`). */
  pk: string
  /** Login path; defaults to the standard supervisor route. */
  path?: string
  /** Predicate/URL fragment that signals a successful landing (default: leaving the login path). */
  expectPath?: string
  timeout?: number
  /**
   * What counts as "arrived" for the initial navigation. Defaults to `domcontentloaded`.
   *
   * See the note on `MountOptions.waitUntil`: `load` is playwright's default and is wrong for a
   * real application, because it waits for every subresource — a tag manager, an analytics beacon
   * or any pixel that never settles holds it open until the navigation times out, with the login
   * form rendered and fillable the whole time.
   */
  waitUntil?: 'commit' | 'domcontentloaded' | 'load' | 'networkidle'
  /**
   * What to do about a cookie-consent dialog covering the form. Defaults to `accept`, because an
   * OwlMeans app will not start an authentication flow until consent is answered — see
   * {@link PageHelper.acceptConsent}. Pass `ignore` only in a spec that answers the dialog itself.
   */
  consent?: 'accept' | 'ignore'
  /** When set, capture the filled login form (`supervisor-login-form.png`) before submit. */
  screenshotDir?: string
  /**
   * Answer the marketing-consent step if it is shown right after landing. Defaults to `'save'`
   * (select-all and save) — see {@link PageHelper.answerMarketingConsent}. Pass `'ignore'` to skip the call
   * entirely, e.g. in a spec that answers the step itself.
   */
  marketingConsent?: 'save' | 'ignore'
}

/** Driving one page of an OwlMeans app: consent dialogs, the login flows, screenshots. */
export interface PageHelper {
  /**
   * Answer the marketing-consent full-page step (`@owlmeans/web-marketing-consent`) if it is shown
   * right after login, so a spec driving {@link PageHelper.loginViaSupervisorForm} or
   * {@link PageHelper.loginViaDispatcher} is never blocked behind it.
   *
   * The screen is opt-in per app, and most apps/environments will not have it wired in — that makes
   * detecting its ABSENCE cheaply the whole point. A plain `waitFor` on `[data-marketing-consent]`
   * alone would cost the full `timeout` on every login of every app that never renders it (the same
   * caveat `acceptConsent` documents for the cookie dialog). Instead this races the step's own root
   * against the generic OwlMeans "the app has already landed" / "still on the login screen" markers
   * this helper's own login flows already wait on (`#app-prompt`, `[data-login-method]`) — by the
   * time a login flow calls this, one of those has typically already rendered, so the race resolves
   * as soon as it does: no fixed sleep, and in the common "step absent" case, no material added
   * latency over what the login flow already paid to get here.
   *
   * @returns whether the step was actually shown and answered (including the error/skip fallback);
   * `false` when it never appeared within `timeout`, which is the expected result everywhere
   * the screen is not yet configured or the visitor already has saved consents.
   * @throws if a Terms box could not be confirmed (a `[data-marketing-consent-terms-error]`, or the
   * box is still up with nowhere left to go — Skip is never offered there on purpose).
   */
  answerMarketingConsent: (opts?: AnswerMarketingConsentOptions) => Promise<boolean>
  /**
   * Inject a pre-generated bearer into an app that uses the standard owlmeans
   * dispatcher: navigate to `/dispatcher?token=...` so the web app authenticates
   * and redirects home natively. Note: apps that override the DISPATCHER route
   * (e.g. to force an external IdP) should use {@link PageHelper.loginViaSupervisorForm}.
   */
  loginViaDispatcher: (baseUrl: string, token: string, opts?: DispatcherLoginOptions) => Promise<void>
  /**
   * Save a full-page screenshot to `<dir>/<name>.png`, creating `dir` if needed.
   * Returns the absolute file path. Use a host-backed folder (e.g. the project's
   * `tmp/tests/screenshots`) so the file is visible whether the test runs on the
   * host or inside a dev container.
   */
  saveScreenshot: (dir: string, name: string) => Promise<string>
  /**
   * Answer the cookie-consent dialog if one is up, so the page underneath can be driven.
   *
   * An OwlMeans app asks for consent BEFORE it will start an authentication flow, and the dialog is
   * a modal with no dismissal — by design, since a decision is what the gate is waiting for. For a
   * test that means the login form renders, resolves, reports itself "visible, enabled and stable"
   * and still cannot be clicked, because the overlay intercepts the pointer. Playwright retries for
   * the full timeout and then blames the button, which is the most misleading failure in this
   * helper: nothing is wrong with the form.
   *
   * Accepting is the honest default for a login helper — the flow it is about to drive is exactly
   * what the dialog is gating — but it is best-effort: an app without the widget, or one where the
   * visitor already decided, simply has no dialog and this returns at once.
   *
   * It waits for the consent store to SETTLE (`<html data-consent>`), so a visitor still being
   * located is waited out — the transparent overlay is up then and would take the click — and a
   * visitor decided for automatically (outside the consent countries) returns `false` the moment
   * the decision lands, rather than after the whole `timeout`. Whichever surface asks — the bottom
   * bar or the preferences window — carries `[data-consent-dialog]` and `[data-consent-accept-all]`.
   * Where the runner's own country would decide the outcome, pin it with `mockConsentGeo` first.
   *
   * @returns whether a dialog was actually answered.
   */
  acceptConsent: (opts?: AcceptConsentOptions) => Promise<boolean>
  /**
   * Drive the PK-based supervisor login FORM end-to-end (the faithful path that
   * exercises the real supervisor plugin + registration): navigate to the
   * supervisor login route, fill the user id + private key, submit, and wait for
   * the app to leave the login screen.
   */
  loginViaSupervisorForm: (opts: SupervisorFormLoginOptions) => Promise<void>
}
