import type { Auth } from '@owlmeans/auth'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/entrypoint'

export interface MockGuardOptions {
  alias?: string
  /** Auth payload that `handle` will resolve into the response. */
  auth?: Auth
  /** Optional predicate that decides whether `match` reports a hit. Defaults to "always match". */
  allow?: (req: AbstractRequest, res: AbstractResponse<unknown>) => boolean | Promise<boolean>
  /** Token returned by the client-side `authenticated()` method. */
  token?: string
}
