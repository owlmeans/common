import type { LoginIntent } from '../consts.js'

export interface SurrogateTarget {
  intent: LoginIntent
  /** The address the surrogate should actually run, once it is one window up. */
  next?: string
  /** The method the user already chose in the opener. */
  method?: string
}
