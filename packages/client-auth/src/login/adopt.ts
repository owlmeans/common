import type { AuthService } from '@owlmeans/auth-common'
import { DEFAULT_ALIAS as AUTH_ALIAS } from '../consts.js'
import type { LoginContext } from './types.js'

/**
 * The one path an issued bearer token becomes this context's authentication.
 *
 * Resolved by alias rather than through `ctx.auth()` so the login host does not require
 * `AuthServiceAppend` on the context it is given — a plugin can adopt a token on any context that
 * carries the auth service, including one it did not build.
 *
 * Going through `AuthService.update` matters: it stores the record, decodes the envelope and sets
 * both `auth` and `token` in one place. Writing those three by hand — which is what the popup and
 * the MUI relying party each used to do — leaves the same state on a good day and diverges the
 * moment any of it changes.
 */
export const adoptToken = async (ctx: LoginContext, token: string): Promise<void> => {
  await ctx.service<AuthService>(AUTH_ALIAS).update(token)
}
