import type { Auth } from '@owlmeans/auth'
import { trust } from '@owlmeans/auth-common/utils'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { TRUSTED } from '@owlmeans/config'
import { memoHelper } from '@owlmeans/context'
import type { WrappedOIDCService } from '@owlmeans/oidc'
import { OIDC_WRAPPED_TOKEN, WRAPPED_OIDC } from '@owlmeans/oidc'
import type { Config, Context } from '../types.js'
import type { OidcWrappedUtils } from './wrapped/types.js'

export const makeOidcWrappedUtils = (context: Context): OidcWrappedUtils => {
  const wrapper = (): WrappedOIDCService =>
    context.service(WRAPPED_OIDC)

  const signWrapped = async (user: Auth): Promise<string> => {
    const trusted = await trust<Config, Context>(context, TRUSTED, context.cfg.alias ?? context.cfg.service)
    const authorization = await makeEnvelopeModel<Auth>(OIDC_WRAPPED_TOKEN)
      .send(user, null).sign(trusted.key, EnvelopeKind.Token)

    return `${OIDC_WRAPPED_TOKEN.toUpperCase()} ${authorization}`
  }

  return { wrapper, signWrapped }
}

/** The wrapped-token utils of a context — one per context. */
export const oidcWrappedOf = memoHelper.oncePer(makeOidcWrappedUtils)
