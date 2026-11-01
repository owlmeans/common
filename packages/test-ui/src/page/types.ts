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

export interface EmailWaiverRouteOptions {
  /** The e-mail routes' base path; default `EMAIL_AUTH_API_PATH` (`/auth/email`). */
  apiPath?: string
}

export interface EmailFormLoginOptions {
  baseUrl: string
  /** The address to sign in (registered by its first PIN sign-in). */
  email: string
  /**
   * Turns each mailed challenge into the PIN to type — normally `makeEmailTechClient(…).rewritePin`.
   * Called once per challenge the form receives: the send-PIN answer, or a password sign-in's
   * device answer.
   */
  rewritePin: (challenge: string) => Promise<string>
  /**
   * Sign in with this password instead of asking for a PIN. On a device the account does not know
   * the server mails a PIN instead (`reason: 'device'`), which the helper then answers like any other.
   */
  password?: string
  /**
   * A developer waiver (`makeEmailTechClient(…).waiver()`): sent in `EMAIL_WAIVER_HEADER` on the
   * e-mail routes only — never on any other request — while this login runs.
   */
  waiver?: string
  /**
   * `email` (default) opens the e-mail card at `path` directly; `dispatcher` opens the chooser at
   * `dispatcherPath` and presses "Continue with email" (`[data-login-method="email"]`), ticking a
   * Terms box first when the chooser shows one.
   */
  start?: 'email' | 'dispatcher'
  /** The e-mail card's path; default `/authentication/login/email`. */
  path?: string
  /** The chooser's path; default `/dispatcher`. */
  dispatcherPath?: string
  /** The e-mail routes' base path, as their URLs end; default `/auth/email`. */
  apiPath?: string
  /**
   * The post-sign-in password offer: `'skip'` (default) presses "Not now"; `{ password }` sets that
   * password; `'ignore'` leaves the step on screen for the spec.
   */
  offer?: 'skip' | 'ignore' | { password: string }
  /** Answer the marketing-consent step (`'save'`, default) or leave it to the spec (`'ignore'`). */
  marketingConsent?: 'save' | 'ignore'
  /** What counts as landed: a URL containing this. Default — the landed marker (`landedSelector`). */
  expectPath?: string
  /** The element a landed app shows; default `#app-prompt`. Without it and `expectPath` the wait costs the full timeout. */
  landedSelector?: string
  /** One budget for every wait; default 60s. */
  timeout?: number
  /** Default `domcontentloaded` — see `MountOptions.waitUntil`. */
  waitUntil?: 'commit' | 'domcontentloaded' | 'load' | 'networkidle'
  /** The cookie-consent dialog: `'accept'` (default) or `'ignore'`. */
  consent?: 'accept' | 'ignore'
  /** When set, capture the filled form (`email-login-form.png`) before it is submitted. */
  screenshotDir?: string
}

/** What a {@link PageHelper.loginViaEmailForm} went through. */
export interface EmailFormLoginResult {
  mode: 'pin' | 'password'
  /** A password sign-in met an unknown device and was finished with a PIN. */
  device: boolean
  /** PIN challenges answered. */
  pins: number
  /** The password offer: never shown, skipped, answered with a password, or left on screen. */
  offer: 'none' | 'skipped' | 'set' | 'shown'
  /** The marketing-consent step was shown and answered. */
  marketingConsent: boolean
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
  /**
   * Send `waiver` in `EMAIL_WAIVER_HEADER` on every request of this page whose URL path contains
   * `<apiPath>/` — and on nothing else. Resolves the function that stops it.
   *
   * It is a `page.route`, and routing turns Playwright's HTTP cache off for the page while it is
   * installed; the predicate keeps every other request untouched otherwise.
   */
  routeEmailWaiver: (waiver: string, opts?: EmailWaiverRouteOptions) => Promise<() => Promise<void>>
  /**
   * Sign in through the real e-mail card (`@owlmeans/web-auth-email`): open it (or the chooser),
   * answer the cookie dialog, type the address, send for a PIN — the challenge is read from the
   * send-PIN answer and handed to `rewritePin` for the PIN to type — then submit it. With `password`
   * the password is tried first, and a device answer is finished with a PIN. After the sign-in it
   * answers the password offer and the marketing-consent step in whatever order they come, and
   * waits for the landing (`expectPath`, else `landedSelector`).
   */
  loginViaEmailForm: (opts: EmailFormLoginOptions) => Promise<EmailFormLoginResult>
}

/** The e-mail half of {@link PageHelper}, built over the page and the helper's own consent answers. */
export interface EmailLoginFlow extends Pick<PageHelper, 'routeEmailWaiver' | 'loginViaEmailForm'> {}

/** What the e-mail flow borrows from the page helper. */
export interface EmailLoginFlowDeps extends Pick<PageHelper, 'acceptConsent' | 'answerMarketingConsent' | 'saveScreenshot'> {}
