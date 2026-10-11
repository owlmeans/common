export interface WebSupervisorAuthOptions {
  /** Force enable/disable. Default: `cfg.debug.supervisor === true`. */
  enabled?: boolean
  /**
   * Also offer it on the sign-in screen. Defaults to true — an operator login that is registered
   * but reachable only by typing its URL is a login nobody finds and an exposure nobody sees.
   */
  offer?: boolean
}
