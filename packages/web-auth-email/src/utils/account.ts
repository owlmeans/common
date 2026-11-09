import type { AuthService } from '@owlmeans/auth-common'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { DEFAULT_ALIAS as AUTH_SERVICE } from '@owlmeans/client-auth'

/** The signed-in account's id, when the client auth service can say — the owner of an offer ticket. */
export const signedInAccount = <C extends BasicConfig>(ctx: BasicContext<C>): string | undefined => {
  try {
    return ctx.service<AuthService>(AUTH_SERVICE).user().userId
  } catch {
    return undefined
  }
}
