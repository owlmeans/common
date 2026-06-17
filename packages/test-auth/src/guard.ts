import { createService } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import type { Auth } from '@owlmeans/auth'
import type { AbstractRequest, AbstractResponse, GuardService } from '@owlmeans/entrypoint'

export interface MockGuardOptions {
  alias?: string
  /** Auth payload that `handle` will resolve into the response. */
  auth?: Auth
  /** Optional predicate that decides whether `match` reports a hit. Defaults to "always match". */
  allow?: (req: AbstractRequest, res: AbstractResponse<unknown>) => boolean | Promise<boolean>
  /** Token returned by the client-side `authenticated()` method. */
  token?: string
}

/**
 * Build a `GuardService` that resolves to a chosen `Auth` without exercising
 * any real cryptography or trusted-record lookup. Use this in category-B
 * tests where the goal is to verify behaviour that depends on an
 * already-authenticated identity.
 *
 * The mock implements the full `GuardService` shape — `match`, `handle`,
 * `authenticated` — so it can be registered on a context exactly the way
 * a real guard is.
 */
export const makeMockGuard = (opts: MockGuardOptions = {}): GuardService => {
  const alias = opts.alias ?? DEFAULT_GUARD
  const allow = opts.allow ?? (() => true)

  const guard = createService<GuardService>(alias, {
    token: opts.token,

    match: async (req, res) => {
      return Boolean(await allow(req, res))
    },

    handle: async (_req, res) => {
      if (opts.auth != null) {
        res.resolve(opts.auth)
      }
      return opts.auth as never
    },

    authenticated: async () => opts.token ?? null,
  })

  return guard
}

/**
 * Register a mock guard on `context` that resolves to the given `auth`.
 * Returns the same context for chaining. Existing guards under the same
 * alias are not replaced — register before any real guard service.
 */
export const withAuth = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T,
  auth: Auth,
  alias: string = DEFAULT_GUARD
): T => {
  const guard = makeMockGuard({ alias, auth })
  return context.registerService<T>(guard)
}
