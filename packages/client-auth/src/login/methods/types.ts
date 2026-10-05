import type { LoginScreenConfig } from '@owlmeans/config'
import type { LoginMethod, LoginMethodContext, LoginMethodSource } from '../types.js'

/** The sign-in methods on offer: the global source registry and the resolution of a screen's list. */
export interface LoginMethodsHelper {
  /** Register a source globally — replacing an earlier one of the same alias. */
  registerMethodSource: (source: LoginMethodSource) => void
  /** The globally registered sources, in registration order. */
  listMethodSources: () => LoginMethodSource[]
  /**
   * Everything the current environment may be offered, in the order it should be offered in.
   *
   * Resolution order matters and is not arbitrary:
   *
   * 1. Sources produce candidates. A source that throws is skipped rather than taking the screen
   *    down — a misconfigured provider list must not remove the sign-in method that does work.
   * 2. `restricted` candidates are dropped unless the configuration named them, which is what makes
   *    an operator login opt-in rather than merely unadvertised.
   * 3. An explicit `methods` list is both a filter AND the order, because an app that bothered to
   *    list them means that list.
   */
  resolveLoginMethods: (
    ctx: LoginMethodContext, cfg?: LoginScreenConfig, extra?: LoginMethodSource[]
  ) => LoginMethod[]
  /**
   * The method a screen highlights and focuses.
   *
   * The first `primary` one, else the first offered. It is highlighted, never started: requirement
   * one of this whole feature is that nothing leaves the document without a click.
   */
  primaryLoginMethod: (methods: LoginMethod[]) => LoginMethod | null
}
