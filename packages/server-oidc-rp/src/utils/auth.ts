import type { AuthCredentials } from '@owlmeans/auth'
import { AuthenFailed, AuthenPayloadError } from '@owlmeans/auth'
import type { Config, Context, OidcClientService, TokenSet } from '../types.js'
import type { OidcProviderConfig } from '@owlmeans/oidc'
import type { } from 'openid-client'
import Url from 'url'
import { cache, exchangeId, verifierId } from './cache.js'
import { DEFAULT_ALIAS } from '../consts.js'
import { base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils'
import { AUTHEN_TIMEFRAME } from '@owlmeans/server-auth'

export const makeOidcAuthentication = <C extends Config, T extends Context<C>>(context: T) =>
  async (credential: AuthCredentials): Promise<[OidcProviderConfig, TokenSet, string]> => {
    console.log('Challenge we got: ', credential.challenge)
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

    console.log("\n\nWe are picking verifier by id: ", verifierId(challenge))
    const verification = await cache<C, T>(context).pick(verifierId(challenge))
    console.log("Verification we get: ", verification, "\n\n")
    if (verification.verifier == null) {
      throw new AuthenFailed()
    }
    if (verification.client == null) {
      throw new AuthenFailed()
    }

    const oidc = context.service<OidcClientService>(DEFAULT_ALIAS)
    console.log(">>>>>>>> client we are trying to extract: ", verification)
    const cfg = await oidc.getConfig({
      clientId: verification.client,
      ...(verification.entityId != null ? { entityId: verification.entityId } : {})
    })
    if (cfg == null) {
      throw new AuthenFailed()
    }

    const client = await oidc.getClient(cfg.clientId)
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
    await cache<C, T>(context).create(
      { id: exchangeId(exchangeToken), payload: tokenSet },
      { ttl: AUTHEN_TIMEFRAME / 1000 }
    )

    return [cfg, tokenSet, exchangeToken]
  }
