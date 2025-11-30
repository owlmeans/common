import type { RefedModuleHandler } from '@owlmeans/server-module'
import { handleBody } from '@owlmeans/server-api'
import type { OIDCAuthInitParams, OidcProviderDescriptor } from '@owlmeans/oidc'
import { AuthenPayloadError, AuthUnknown, DISPATCHER } from '@owlmeans/auth'
import { assertContext } from '@owlmeans/context'
import type { Config, Context, OidcClientAdapter, OidcClientService } from '../types.js'
import type { ClientModule } from '@owlmeans/client-module'
import { authService, DEFAULT_ALIAS } from '../consts.js'
// import {  PROVIDER_CACHE_TTL } from '../consts.js'
// import type { Client } from 'openid-client'

import { base64urlnopad as base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha2'
import { cache, verifierId } from '../utils/cache.js'
import { AUTHEN_TIMEFRAME } from '@owlmeans/server-auth'

export const init: RefedModuleHandler = handleBody(async (body: OIDCAuthInitParams, ctx) => {
  if (body.entity == null) {
    throw new AuthenPayloadError('entity')
  }

  const entityId = body.entity

  const context = assertContext<Config, Context>(ctx)
  const oidc = context.service<OidcClientService>(DEFAULT_ALIAS)

  let client: OidcClientAdapter | null = null

  const defaultClientId = oidc.getDefault()
  if (defaultClientId != null) {
    client = await oidc.getClient(defaultClientId)
  }
  if (client == null) {
    // if (!oidc.hasProvider({ entityId })) {
    /**
     * @TODO We need to move it to some remote resource.
     * And make oidc service itself use such a resource to get required client.
     */
    const [providers] = await context.module<ClientModule<OidcProviderDescriptor[]>>(
      authService.provider.list
    ).call({
      params: { service: context.cfg.alias ?? context.cfg.service },
      query: { entityId }
    })

    if (providers.length < 1) {
      throw new AuthUnknown()
    }

    console.log("\n\n ************* \n Providers we get from remote:", providers)

    const provider = providers.find(p => p.def === true) ?? providers.shift()
    // Loaded providers can't be default otherwise we will get stuck with one of them
    if (provider != null && "def" in provider) {
      delete provider.def
    }

    console.log("\n\nProvider we choose:", provider)
    console.log("************* \n\n")

    if (provider == null) {
      throw new AuthUnknown()
    }
    oidc.registerTemporaryProvider(provider)
    client = await oidc.getClient({ clientId: provider.clientId, entityId })
  }
  // Cache provider for a while - we dont actually need to clean it up
  // setTimeout(() => provider && oidc.unregisterTemporaryProvider(provider), PROVIDER_CACHE_TTL)
  // } else {
  //   client = await oidc.getClient({
  //     entityId, clientId: oidc.entityToClientId({ entityId })
  //   })
  // }

  const verifier = base64.encode(randomBytes(32))
  const challenge = base64.encode(sha256(verifier))

  console.log("\n\n We create verifierID: ", verifierId(challenge), verifier, " with client: ", client.getClientId(), "\n\n")

  await cache(context).create({
    id: verifierId(challenge),
    verifier,
    client: client.getClientId(),
    entityId,
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
