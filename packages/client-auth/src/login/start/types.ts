import type { LoginOutcome } from '../consts.js'

/** What a "Log in" control hands `startLogin`: where the flow starts, where it lands, how to move. */
export interface LoginStart {
  /** The resolved dispatcher path — where the login flow starts. */
  url: string
  /** Entrypoint alias to land on once signed in; absent means the ordinary landing. */
  target?: string
  /** The in-app navigation, supplied by a component because only a component may hold one. */
  go: (alias: string) => void | Promise<void>
}

/** The decision behind a "Log in" control, bound to the application context. */
export interface LoginStartHelper {
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
  startLogin: (start: LoginStart) => Promise<LoginOutcome>
}
