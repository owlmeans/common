import type { Auth } from '@owlmeans/auth'
import { trust } from '@owlmeans/auth-common/utils'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { TRUSTED } from '@owlmeans/config'
import type { WrappedOIDCService } from '@owlmeans/oidc'
import { OIDC_WRAPPED_TOKEN, WRAPPED_OIDC } from '@owlmeans/oidc'
import type { Config, Context } from '../types.js'

export const wrapper = (context: Context): WrappedOIDCService =>
  context.service(WRAPPED_OIDC)

/** Signs `user` with this service's trusted key into the bearer value of a wrapped token. */
export const signWrapped = async <C extends Config, T extends Context<C>>(context: T, user: Auth): Promise<string> => {
  const trusted = await trust<C, T>(context, TRUSTED, context.cfg.alias ?? context.cfg.service)
  const authorization = await makeEnvelopeModel<Auth>(OIDC_WRAPPED_TOKEN)
    .send(user, null).sign(trusted.key, EnvelopeKind.Token)

  return `${OIDC_WRAPPED_TOKEN.toUpperCase()} ${authorization}`
}
