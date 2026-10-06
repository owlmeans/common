import type { Config, Context } from '../../types.js'

/** Carries the serving context on one raw request. */
export interface RequestContextHelper {
  /** Stores the context on the request. */
  populateContext: <C extends Config, T extends Context<C>>(context: T) => void
  /**
   * The context stored on the request, else `ctx`.
   *
   * @throws {SyntaxError} when neither is there
   */
  extractContext: <C extends Config, T extends Context<C>>(ctx?: T, location?: string) => T
}
