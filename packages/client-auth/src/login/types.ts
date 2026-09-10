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
  /** The attempt ended with no token (blocked window, user closed it, provider refused). */
  Failed = 'failed',
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

export interface LoginServiceAppend {
  login: () => LoginService
}
