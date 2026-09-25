import type { ComponentType, CSSProperties, ReactNode } from 'react'
import type { LazyService, BasicContext } from '@owlmeans/context'
import type { LoginMethodEmphasis, LoginScreenConfig, LoginTermsConfig } from '@owlmeans/config'

/**
 * The context a login plugin is handed.
 *
 * Deliberately `BasicContext<any>`, matching `RouterService`: a plugin only ever reaches services
 * by alias, and pinning the config parameter would make every concrete app config — each of which
 * adds its own required fields — fail to satisfy it, since `makeContext` is invariant in it.
 */
export type LoginContext = BasicContext<any>

/**
 * Environment descriptor the cascade selects a login plugin on.
 *
 * This is the single source of environment truth — do NOT bake `window.self !== window.top` or a
 * `sessionStorage` probe into a plugin's `match`. A native host will supply its own descriptor
 * (`hasWindow: false`) so an in-app-browser plugin wins there without any DOM check.
 */
export interface LoginEnv {
  /** A DOM is present at all (false under SSR, native, and unit tests). */
  hasWindow: boolean
  /** This document is embedded in a frame. A cross-origin `top` read throws — that throw counts. */
  embedded: boolean
  /** This document IS the surrogate login window; survives the cross-origin round trip. */
  surrogate: boolean
  /** The window that opened this one is still reachable (COOP severs it permanently). */
  hasOpener: boolean
}

/** What a stage did, and therefore what the caller must do next. */
export enum LoginOutcome {
  /** The plugin took the flow over and it is finished. The caller does nothing more. */
  Handled = 'handled',
  /** The plugin did nothing — the caller carries on with its ordinary continuation. */
  Passed = 'passed',
  /** The browser is leaving this document. The caller must not navigate or render. */
  Redirected = 'redirected',
  /** Cannot proceed without a fresh user gesture — the caller renders a sign-in control. */
  Gesture = 'gesture',
  /** Authenticated, but with no channel back to the window that started it. */
  Orphaned = 'orphaned',
  /** The attempt ended with no token (the user closed the window, or the provider refused it). */
  Failed = 'failed',
  /**
   * A window this flow needed could not be opened at all — `window.open` returned `null`, which is
   * the browser's own popup blocker, not a flow failure. Distinct from {@link Failed}: a caller
   * with nowhere inline to render (a header "Log in"/"Log out" control, not the sign-in screen)
   * needs to know specifically that a fresh click reopening the SAME control will not help, and
   * that the browser is already showing its own blocked-popup affordance somewhere.
   */
  Blocked = 'blocked',
}

/** Why a surrogate window was opened. */
export enum LoginIntent {
  Login = 'login',
  Logout = 'logout',
}

export interface LoginRequest {
  /** Where the login flow starts — a resolved dispatcher path, or the current address. */
  url: string
  /**
   * The ordinary in-app continuation, supplied by the caller because only a component may call
   * `useNavigate`. A plugin that decides not to take the flow over calls this; without it the
   * fallback is a full page load of {@link url}.
   */
  navigate?: () => void | Promise<void>
  /** Entrypoint alias to return to after login. */
  target?: string
}

export interface LogoutRequest {
  /** Where a surrogate logout runs — a resolved surrogate path. */
  url: string
  /** The in-app continuation once the local session is gone. */
  navigate?: () => void | Promise<void>
}

/**
 * A pluggable login mechanic — WHERE the authorization round trip runs.
 *
 * Not to be confused with `AuthenticationPlugin` (./manager/plugins), which answers *how* a user
 * proves their identity. This one answers *in which browsing context the flow can complete*: a
 * redirect works in an ordinary tab and cannot work inside a frame whose provider refuses to be
 * embedded, and that difference is a property of the environment, not of the credential.
 */
export interface LoginPlugin {
  alias: string
  /** Higher wins among matching plugins. Defaults to 0. */
  priority?: number
  /** Free-form tag, e.g. 'redirect' | 'surrogate' | 'native'. */
  mode?: string
  /** Selector; `undefined` means "always applicable". */
  match?: (env: LoginEnv, ctx?: LoginContext) => boolean

  /**
   * Record, while it is still knowable, whatever the later stages need about this document.
   *
   * Called synchronously as the FIRST statement of the dispatcher's effect: everything after it
   * can navigate away, and some of the evidence (notably `window.name`) is cleared by the browser
   * the moment a top-level context goes cross-origin.
   */
  enter?: (ctx: LoginContext, env: LoginEnv) => void

  /**
   * Start login from a user gesture.
   *
   * MUST open any window synchronously — the popup blocker only yields while the gesture is still
   * being handled. Implement as a NON-async function returning a promise.
   */
  begin: (ctx: LoginContext, request: LoginRequest, env: LoginEnv) => Promise<LoginOutcome>

  /** Send the browser to the identity provider's authorization URL. */
  authorize: (ctx: LoginContext, url: string, env: LoginEnv) => Promise<LoginOutcome>

  /** A bearer token was issued in this document — decide where it goes. */
  complete: (ctx: LoginContext, token: string, env: LoginEnv) => Promise<LoginOutcome>

  /**
   * This document ALREADY holds a session — decide whether it is useful here.
   *
   * Absent means `Passed`: keep it and carry on, which is what an ordinary tab has always done.
   * A surrogate hands it back to its opener instead, which is the whole point: a popup that
   * discovers an existing session must sign the framed application in, not display the
   * application to itself.
   *
   * Deliberately not `complete`: "a token was just issued here" and "a token was already here"
   * are different facts, and a silent-refresh plugin will need to tell them apart.
   */
  resume?: (ctx: LoginContext, token: string, env: LoginEnv) => Promise<LoginOutcome>

  /**
   * Start logout from a user gesture.
   *
   * MUST open any window synchronously, for exactly the reason `begin` must — logging out of a
   * framed application opens a window too. Implement as a NON-async function.
   */
  logout?: (ctx: LoginContext, request: LogoutRequest, env: LoginEnv) => Promise<LoginOutcome>

  /** The local session is gone in this document — decide what to tell whom. */
  logoutComplete?: (ctx: LoginContext, env: LoginEnv) => Promise<LoginOutcome>
}

/**
 * Something that must be true before a login flow may start.
 *
 * SYNCHRONOUS on purpose. `begin` must not cross a microtask boundary before a plugin's
 * `window.open`, or the popup blocker eats the window. A precondition that has to ask a server
 * belongs somewhere else entirely.
 *
 * Returning false stops the flow and resolves `begin` as {@link LoginOutcome.Gesture} — which
 * already means "cannot proceed without a fresh user gesture; render a control", and is exactly
 * the state a user is in after a blocking dialog has opened over the page.
 */
export interface LoginPrecondition {
  alias: string
  /** Higher runs first. Defaults to 0. */
  priority?: number
  check: (ctx: LoginContext, request: LoginRequest, env: LoginEnv) => boolean
}

/** What a source needs in order to describe the methods it offers. */
export interface LoginMethodContext {
  context: LoginContext
  env: LoginEnv
  /** In-app navigation, when a component supplied it. */
  navigate?: (alias: string, params?: Record<string, string>) => void | Promise<void>
}

/**
 * One way to sign in, as the screen renders it.
 *
 * `start` is what a button calls. It MUST be callable synchronously from a click — branch on
 * `env.embedded && !env.surrogate` first and open any window before the first `await`.
 */
export interface LoginMethod {
  id: string
  /** Set when an `AuthenticationPlugin` drives this method. */
  type?: string
  label?: string
  i18nKey?: string
  icon?: string
  order?: number
  emphasis?: LoginMethodEmphasis
  restricted?: boolean
  params?: Record<string, string>
  start: (ctx: LoginMethodContext) => Promise<LoginOutcome>
}

export interface LoginMethodSource {
  alias: string
  list: (ctx: LoginMethodContext) => LoginMethod[]
}

/** What every rendering of the sign-in screen accepts, whatever its UI family. */
export interface LoginScreenProps {
  /** The one thing a consuming application is expected to supply. */
  Logo?: ComponentType<{ className?: string }> | ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  /**
   * `(key, defaultValue) => string`. A prop, never an implicit context read: a component that
   * reaches for an i18n provider crashes the whole render in an app mounted without one.
   */
  translate?: (key: string, defaultValue: string) => string
  /**
   * The current language, for `Intl.ListFormat` and a custom document's own locale-keyed label.
   *
   * A prop for the same reason `translate` is: a component that reaches for an i18n context
   * directly crashes the whole render in an app mounted without one.
   */
  locale?: string
  /** Replace or reorder what the resolver produced. */
  methods?: LoginMethod[] | ((methods: LoginMethod[]) => LoginMethod[])
  terms?: LoginTermsConfig | false
  config?: LoginScreenConfig
  /** Replaces the composed credit line entirely. */
  footer?: ReactNode
  className?: string
  containerClassName?: string
  /**
   * Inline overrides for the screen's outer box.
   *
   * It exists because the outer box carries its viewport height inline rather than as a utility
   * class, and an escape hatch that a class can no longer provide has to be provided some other
   * way. See the note on the screen itself.
   */
  style?: CSSProperties
}

export type LoginScreenComponent = ComponentType<LoginScreenProps>

/**
 * A way to surface a `begin`/`logout` outcome that has no inline screen to render it on.
 *
 * A header "Log in"/"Log out" control (`useLogin`/`useLogout`) fires the facade and forgets the
 * result — it renders nothing of its own, unlike the sign-in screen, which already shows
 * `loginAttemptError` inline. Registering one is how a UI package (`web-panel`, `mui-panel`) gives
 * that control a way to speak — e.g. a toast when {@link LoginOutcome.Blocked} fires. Unregistered,
 * it is silence, which is what a non-DOM host and a screen-mounted flow both already have.
 */
export type LoginNotifier = (outcome: LoginOutcome, env: LoginEnv) => void

export interface LoginService extends LazyService {
  registerPlugin: (plugin: LoginPlugin) => void
  /** Select the active plugin for the given (or default) environment. */
  plugin: (env?: LoginEnv) => LoginPlugin
  /** The environment the cascade is currently selecting on. */
  env: () => LoginEnv
  /** Something that must hold before any flow starts. Checked synchronously, in `begin`. */
  registerPrecondition: (precondition: LoginPrecondition) => void
  /** A source of offerable sign-in methods, scoped to this context. */
  registerMethodSource: (source: LoginMethodSource) => void
  methods: (ctx: LoginMethodContext) => LoginMethod[]
  /**
   * The screen a dispatcher renders when it cannot proceed.
   *
   * A slot rather than an import, because a relying party (`web-oidc-rp`) must never depend on a
   * UI family (`web-panel` / `mui-panel`) — that edge would force every relying party to pick one.
   */
  registerScreen: (screen: LoginScreenComponent) => void
  screen: () => LoginScreenComponent | null
  /** See {@link LoginNotifier}. Replaces any previously registered notifier. */
  registerNotifier: (notifier: LoginNotifier) => void
  /** Register a post-login step. Replace-by-alias, priority-sorted (higher first). */
  registerStep: (step: LoginStep) => void
  /** Every registered step, priority-sorted (higher first). */
  steps: () => LoginStep[]
  /** Register a hook that observes a freshly authenticated token. Replace-by-alias, priority-sorted. */
  onLanded: (hook: LoginLandingHook) => void
  /** Every registered landing hook, priority-sorted (higher first). */
  landingHooks: () => LoginLandingHook[]
  // Facade — every method re-selects the plugin and delegates.
  // NOTE: these stay plain writable instance properties, never getters, so that alternative
  // implementations (e.g. a native login service) can monkey-patch them directly.
  enter: () => void
  begin: (request: LoginRequest) => Promise<LoginOutcome>
  authorize: (url: string) => Promise<LoginOutcome>
  complete: (token: string) => Promise<LoginOutcome>
  resume: (token: string) => Promise<LoginOutcome>
  logout: (request: LogoutRequest) => Promise<LoginOutcome>
  logoutComplete: () => Promise<LoginOutcome>
  /** Adopt an issued bearer token as this context's authentication. */
  adopt: (token: string) => Promise<void>
  /** Drop this document's authentication. The single de-adoption path. */
  revoke: () => Promise<void>
}

/**
 * The value shape a landing's `params`/`query` carries.
 *
 * Matches `FlowPayload` (`@owlmeans/flow`) and the `AbstractRequest` params/query fields
 * (`@owlmeans/entrypoint`) structurally, rather than the narrower `Record<string, string>`, so a
 * `LoginLanding` can be built directly from either a `SuspendedLandingRecord`'s query or a
 * dispatcher's own forwarded `params`/`query` without a lossy re-cast at every call site.
 */
export type LoginLandingParams = Record<string, string | number | boolean | undefined | null>

/**
 * A step to run after sign-in completes, before the ordinary landing.
 *
 * Registered by a package that must collect something from a freshly authenticated user before
 * the application resumes wherever it was headed — the marketing-consent screen is the first
 * consumer. `landAfterLogin`/`continueLogin` (./land.js) walk the registered steps in priority
 * order and land on the first one whose `pending` resolves `true`.
 */
export interface LoginStep {
  alias: string
  /** Higher runs first. Defaults to 0. */
  priority?: number
  /** Entrypoint alias to navigate to while this step is pending. */
  entrypoint: string
  /** Extra query parameters for the landing, alongside the step's own alias. */
  query?: (ctx: LoginContext) => LoginLandingParams | undefined
  /** Whether this step still has something to collect from the signed-in user. */
  pending: (ctx: LoginContext) => Promise<boolean>
  /**
   * This step is where the Terms confirmation lives instead of on the sign-in screen.
   *
   * `termsDeferred(ctx)` (`./terms.js`) is true only while a step with this flag is both
   * registered AND bound (`ctx.hasEntrypoint(step.entrypoint)`) — an app that registers the step
   * but never binds its screen keeps the sign-in checkbox, fail-closed.
   */
  confirmsTerms?: boolean
  /**
   * A `pending` that throws or times out counts as PENDING rather than "not pending".
   *
   * The default (`undefined`/`false`) keeps every existing step fail-open, exactly as before —
   * this flag is for a step whose whole point is to gate the landing on something the person must
   * do (Terms confirmation), where a broken read must show the step rather than let it through.
   */
  required?: boolean
}

/** Where a finished sign-in (or a pending step) lands. */
export interface LoginLanding {
  alias: string
  params?: LoginLandingParams
  query?: LoginLandingParams
  /** The step alias this landing came from, when it came from one. */
  step?: string
}

/**
 * Observes that a freshly authenticated token has landed — unlike {@link LoginStep}, it never
 * blocks the landing, it only reacts to it, once per distinct token.
 *
 * MUST never throw uncaught: the caller (`landAfterLogin`) bounds and swallows every hook's
 * failure, on a timeout as well as a rejection, so a broken hook can never block sign-in.
 */
export interface LoginLandingHook {
  alias: string
  priority?: number
  landed: (ctx: LoginContext) => Promise<void>
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

export interface LoginServiceAppend {
  login: () => LoginService
}
