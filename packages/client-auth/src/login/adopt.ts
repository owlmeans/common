import type { AuthService } from '@owlmeans/auth-common'
import { memoHelper } from '@owlmeans/context'
import { DEFAULT_ALIAS as AUTH_ALIAS } from '../consts.js'
import type { LoginContext } from './types.js'
import type { LoginTokenHelper } from './adopt/types.js'

export const makeLoginTokenHelper = (ctx: LoginContext): LoginTokenHelper => {
  const adoptToken = async (token: string): Promise<void> => {
    await ctx.service<AuthService>(AUTH_ALIAS).update(token)
  }

  const revokeToken = async (): Promise<void> => {
    await ctx.service<AuthService>(AUTH_ALIAS).update(undefined)
  }

  return { adoptToken, revokeToken }
}

/** The token helper of a context — one per context. */
export const loginTokenOf = memoHelper.oncePer(makeLoginTokenHelper)

/** @deprecated compat:factory-refactor — use `loginTokenOf(ctx).adoptToken(…)` */
export const adoptToken = async (ctx: LoginContext, token: string): Promise<void> => loginTokenOf(ctx).adoptToken(token)

/** @deprecated compat:factory-refactor — use `loginTokenOf(ctx).revokeToken()` */
export const revokeToken = async (ctx: LoginContext): Promise<void> => loginTokenOf(ctx).revokeToken()
