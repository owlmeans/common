import type { LazyService, BasicContext } from '@owlmeans/context'

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
  /** Authenticated, but with no channel back to the window that started the flow. */
  Orphaned = 'orphaned',
  /** The attempt ended with no token (blocked window, user closed it, provider refused). */
  Failed = 'failed',
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
}

export interface LoginService extends LazyService {
  registerPlugin: (plugin: LoginPlugin) => void
  /** Select the active plugin for the given (or default) environment. */
  plugin: (env?: LoginEnv) => LoginPlugin
  /** The environment the cascade is currently selecting on. */
  env: () => LoginEnv
  // Facade — every method re-selects the plugin and delegates.
  // NOTE: these stay plain writable instance properties, never getters, so that alternative
  // implementations (e.g. a native login service) can monkey-patch them directly.
  enter: () => void
  begin: (request: LoginRequest) => Promise<LoginOutcome>
  authorize: (url: string) => Promise<LoginOutcome>
  complete: (token: string) => Promise<LoginOutcome>
  /** Adopt an issued bearer token as this context's authentication. */
  adopt: (token: string) => Promise<void>
}

export interface LoginServiceAppend {
  login: () => LoginService
}
