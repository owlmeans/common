
import type { AuthPlugin } from '@owlmeans/server-auth/manager/plugins'
import type { AppConfig, AppContext } from '@owlmeans/server-auth/manager'
import type { OidcClientService } from '../types.js'
import { assertType } from '@owlmeans/server-auth/manager/plugins'
import { DEFAULT_ALIAS, OIDC_TOKEN_STORE } from '../consts.js'
import { OIDC_CLIENT_AUTH } from '@owlmeans/oidc'
import { base64urlnopad as base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha256'
import Url from 'url'
import { ALL_SCOPES, AuthenFailed, AuthenPayloadError, AuthRole } from '@owlmeans/auth'
import type { Resource } from '@owlmeans/resource'
import { AUTH_CACHE, AUTHEN_TIMEFRAME } from '@owlmeans/server-auth'
import type { OIDCAuthCache } from './types.js'
import { decodeJwt } from 'jose'

const verifierId = (challenge: string) => `verifier:${challenge}`
const exchangeId = (exchange: string) => `${OIDC_TOKEN_STORE}:${exchange}`

export const oidcClientPlugin = <C extends AppConfig, T extends AppContext<C>>(context: T): AuthPlugin => {
  const cache = (context: T): Resource<OIDCAuthCache> =>
    context.resource<Resource<OIDCAuthCache>>(AUTH_CACHE)

  const plugin: AuthPlugin = {
    type: OIDC_CLIENT_AUTH,

    init: async request => {
      assertType(request.type, plugin)

      const verifier = base64.encode(randomBytes(32))
      const challenge = base64.encode(sha256(verifier))

      await cache(context).create({ id: verifierId(challenge), verifier }, { ttl: AUTHEN_TIMEFRAME / 1000 })

      const oidc = context.service<OidcClientService>(DEFAULT_ALIAS)
      const client = await oidc.getClient()
      const url = client.authorizationUrl({
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: request.source,
      })

      return { challenge: url }
    },

    authenticate: async credential => {
      console.log('OIDC authentication finishing', credential)
      const oidc = context.service<OidcClientService>(DEFAULT_ALIAS)

      const client = await oidc.getClient()

      const params = client.callbackParams('/?' + credential.credential)
      console.log('Incoming params', params)

      const challengeParts = credential.challenge.split(':http')
      const redirectUrl = challengeParts[0]
      const challengeUrl = new Url.URL('http' + challengeParts[1])
      const challenge = challengeUrl.searchParams.get('code_challenge')
      if (challenge == null) {
        throw new AuthenPayloadError('code_challenge')
      }
      const verification = await cache(context).pick(verifierId(challenge))
      if (verification.verifier == null) {
        throw new AuthenFailed()
      }

      const tokenSet = await client.callback(redirectUrl, params, { code_verifier: verification.verifier })
      console.log('After authentication token set', tokenSet)

      if (tokenSet.id_token == null || tokenSet.access_token == null) {
        throw new AuthenFailed()
      }

      const exchangeToken = base64.encode(randomBytes(32))
      await cache(context).create(
        { id: exchangeId(exchangeToken), payload: tokenSet },
        { ttl: AUTHEN_TIMEFRAME / 1000 }
      )

      const jwt = decodeJwt(tokenSet.id_token)

      // @TODO we need to do something with scopes - it's not secure
      credential.scopes = [ALL_SCOPES]
      credential.source = params.iss as string ?? credential.source
      credential.role = AuthRole.User
      credential.type = OIDC_CLIENT_AUTH
      credential.userId = jwt.sub ?? credential.userId

      return { token: exchangeToken }
    }
  }

  return plugin
}
