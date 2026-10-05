import { DISPATCHER } from '@owlmeans/auth'
import type { AuthService } from '@owlmeans/auth-common'
import { DEFAULT_ALIAS as AUTH_ALIAS } from '../consts.js'
import { LOGIN_SERVICE } from './consts.js'
import { LoginOutcome } from './types.js'
import type { LoginContext, LoginService } from './types.js'

export interface LoginStart {
  /** The resolved dispatcher path — where the login flow starts. */
  url: string
  /** Entrypoint alias to land on once signed in; absent means the ordinary landing. */
  target?: string
  /** The in-app navigation, supplied by a component because only a component may hold one. */
  go: (alias: string) => void | Promise<void>
}

/**
 * Whether this document already holds a session, answered WITHOUT awaiting anything.
 *
 * Read off the auth service's in-memory token, which every guard and `authenticated()` call fills.
 * A session not yet read from storage answers `false` and costs nothing: the sign-in it starts finds
 * the session at the dispatcher, which lands on the parked target all the same.
 */
const holdsSession = (ctx: LoginContext): boolean => {
  if (!ctx.hasService(AUTH_ALIAS)) {
    return false
  }
  const token = ctx.service<AuthService>(AUTH_ALIAS).token

  return token != null && token !== ''
}

/**
 * What a "Log in" control does when clicked — the decision behind `useLogin`, kept free of React so
 * it is the same rule wherever a control is rendered.
 *
 * - A target and a session already here: go straight to the target — there is nobody to sign in.
 * - Otherwise: begin a sign-in whose continuation is ALWAYS the dispatcher, never the target. A
 *   target travels as `LoginRequest.target`, which the facade parks for the landing; the
 *   dispatcher's own post-sign-in landing (`landAfterLogin` — landing hooks, pending steps such as a
 *   consent screen, then the parked target) brings the person there signed in. Navigating to a
 *   guarded target instead is what used to land a person on it signed out.
 *
 * NOT async, and nothing is awaited before `begin`: the surrogate plugin opens its window inside
 * this call, and a window opened after the gesture has been handled is eaten by the popup blocker.
 */
export const startLogin = (ctx: LoginContext, start: LoginStart): Promise<LoginOutcome> => {
  const { url, target, go } = start
  if (target != null && target !== '' && holdsSession(ctx)) {
    return Promise.resolve(go(target)).then(() => LoginOutcome.Handled)
  }

  return ctx.service<LoginService>(LOGIN_SERVICE).begin({
    url,
    target,
    // Only a component may call `useNavigate`, so the in-app continuation is handed to the
    // plugin rather than reinvented by it.
    navigate: () => { void go(DISPATCHER) },
  })
}
