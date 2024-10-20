import type { RefedModuleHandler } from '@owlmeans/server-module'
import { handleBody } from '@owlmeans/server-api'
import type { OIDCAuthInitParams, OidcProviderDescriptor } from '@owlmeans/oidc'
import { AuthenPayloadError, AuthUnknown, DISPATCHER } from '@owlmeans/auth'
import { assertContext } from '@owlmeans/context'
import type { Config, Context, OidcClientAdapter, OidcClientService } from '../types.js'
import type { ClientModule } from '@owlmeans/client-module'
import { authService, DEFAULT_ALIAS, PROVIDER_CACHE_TTL } from '../consts.js'
// import type { Client } from 'openid-client'

import { base64urlnopad as base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha256'
import { cache, verifierId } from '../utils/cache.js'
import { AUTHEN_TIMEFRAME } from '@owlmeans/server-auth'

export const init: RefedModuleHandler = handleBody(async (body: OIDCAuthInitParams, ctx) => {
  if (body.entity == null) {
    throw new AuthenPayloadError('entity')
  }

  const context = assertContext<Config, Context>(ctx)
  const oidc = context.service<OidcClientService>(DEFAULT_ALIAS)

  let client: OidcClientAdapter
  if (!oidc.hasProvider(body.entity)) {
    /**
     * @TODO We need to move it to some remote resource.
     * And make oidc service itself use such a resource to get required client.
     */
    const [providers] = await context.module<ClientModule<OidcProviderDescriptor[]>>(
      authService.provider.list
    ).call({
      params: { service: context.cfg.alias ?? context.cfg.service },
      query: { entityId: body.entity }
    })

    if (providers.length < 1) {
      throw new AuthUnknown()
    }

    const provider = providers.find(p => p.def === true) ?? providers.shift()

    if (provider == null) {
      throw new AuthUnknown()
    }
    oidc.registerTemporaryProvider(provider)
    client = await oidc.getClient(provider.clientId)
    // Cache provider for a while
    setTimeout(() => provider && oidc.unregisterTemporaryProvider(provider), PROVIDER_CACHE_TTL)
  } else {
    client = await oidc.getClient(oidc.entityToClientId(body.entity))
  }

  const verifier = base64.encode(randomBytes(32))
  const challenge = base64.encode(sha256(verifier))

  await cache(context).create({
    id: verifierId(challenge), verifier, client: client.getClientId()
  }, { ttl: AUTHEN_TIMEFRAME / 1000 })

  const [dispatcherUrl] = await context.module<ClientModule<string>>(DISPATCHER).call()

  const cfg = client.getConfig()
  const url = client.makeAuthUrl({
    scope: `openid profile email ${cfg?.extraScopes ?? ''}`,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    redirect_uri: dispatcherUrl,
  })

  console.log('Url we got', url)

  return url
})
