import type { AuthCredentials } from '@owlmeans/auth'
import { AuthenFailed, AuthenPayloadError } from '@owlmeans/auth'
import type { Config, Context, OidcClientService } from '../types.js'
import type { OidcProviderConfig } from '@owlmeans/oidc'
import type { TokenSet } from 'openid-client'
import Url from 'url'
import { cache, exchangeId, verifierId } from './cache.js'
import { DEFAULT_ALIAS } from '../consts.js'
import { base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils'
import { AUTHEN_TIMEFRAME } from '@owlmeans/server-auth'

export const makeOidcAuthentication = <C extends Config, T extends Context<C>>(context: T) =>
  async (credential: AuthCredentials): Promise<[OidcProviderConfig, TokenSet, string]> => {
    const challengeParts = credential.challenge.split(':http')
    // This is ex. source - url we were going to return user to after all it happens
    const redirectUrl = challengeParts[0]
    // This is the challenge url with all necessary parameters that
    // we sent user to for authentication.
    const challengeUrl = new Url.URL('http' + challengeParts[1])
    const challenge = challengeUrl.searchParams.get('code_challenge')
    if (challenge == null) {
      throw new AuthenPayloadError('code_challenge')
    }
    const verification = await cache<C, T>(context).pick(verifierId(challenge))
    if (verification.verifier == null) {
      throw new AuthenFailed()
    }
    if (verification.client == null) {
      throw new AuthenFailed()
    }

    const oidc = context.service<OidcClientService>(DEFAULT_ALIAS)
    const cfg = await oidc.getConfig(verification.client)
    if (cfg == null) {
      throw new AuthenFailed()
    }

    const client = await oidc.getClient(cfg.clientId)
    const params = client.callbackParams('/?' + credential.credential)

    const tokenSet = await client.callback(redirectUrl, params, { code_verifier: verification.verifier })

    const exchangeToken = base64.encode(randomBytes(32))
    await cache<C, T>(context).create(
      { id: exchangeId(exchangeToken), payload: tokenSet },
      { ttl: AUTHEN_TIMEFRAME / 1000 }
    )

    return [cfg, tokenSet, exchangeToken]
  }
