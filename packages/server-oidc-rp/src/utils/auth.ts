import type { AuthCredentials } from '@owlmeans/auth'
import { AuthenFailed, AuthenPayloadError } from '@owlmeans/auth'
import type { Config, Context, OidcClientService, OidcTokenSet } from '../types.js'
import type { OidcProviderConfig } from '@owlmeans/oidc'
import Url from 'url'
import { oidcCacheOf } from './cache.js'
import { DEFAULT_ALIAS } from '../consts.js'
import { base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils.js'
import { AUTHEN_TIMEFRAME } from '@owlmeans/server-auth'

/**
 * Exchanges an authorization code. Answers the provider descriptor, the token set, the exchange
 * token and — fourth — the organization the person asked to act in at init, if any.
 */
export const makeOidcAuthentication = <C extends Config, T extends Context<C>>(context: T) =>
  async (credential: AuthCredentials): Promise<[OidcProviderConfig, OidcTokenSet, string, string | undefined]> => {
    const challengeParts = credential.challenge.split(':http')
    // This is ex. source - url we were going to return user to after all it happens
    const redirectUrl = challengeParts[0]
    // This is the auth service url with all necessary parameters that
    // we sent user to for authentication.
    const challengeUrl = new Url.URL('http' + challengeParts[1])
    const challenge = challengeUrl.searchParams.get('code_challenge')
    if (challenge == null) {
      throw new AuthenPayloadError('code_challenge')
    }

    const oidcCache = oidcCacheOf(context)
    const verification = await oidcCache.resource().take(oidcCache.verifierId(challenge))
    if (verification.verifier == null) {
      throw new AuthenFailed()
    }
    if (verification.client == null) {
      throw new AuthenFailed()
    }

    const oidc = context.service<OidcClientService>(DEFAULT_ALIAS)
    const cfg = await oidc.getConfig({
      clientId: verification.client,
      ...(verification.entityId != null ? { entityId: verification.entityId } : {})
    })
    if (cfg == null) {
      throw new AuthenFailed()
    }

    const client = await oidc.getClient(cfg)
    const tokenSet = await client.grantWithCode(
      redirectUrl,
      { pkceCodeVerifier: verification.verifier },
      {
        ...Object.fromEntries(new Url.URLSearchParams(credential.credential).entries()),
      }
    )

    // const params = client.callbackParams('/?' + credential.credential)

    // const tokenSet = await client.callback(redirectUrl, params, { code_verifier: verification.verifier })

    const exchangeToken = base64.encode(randomBytes(32))
    await oidcCache.resource().create(
      { id: oidcCache.exchangeId(exchangeToken), payload: tokenSet },
      { ttl: AUTHEN_TIMEFRAME / 1000 }
    )

    return [cfg, tokenSet, exchangeToken, verification.entitySlug]
  }
