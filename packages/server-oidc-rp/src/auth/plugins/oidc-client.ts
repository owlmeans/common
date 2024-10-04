
import type { AuthPlugin } from '@owlmeans/server-auth/manager/plugins'
import type { Config, Context, OidcClientService } from '../../types.js'
import { assertType } from '@owlmeans/server-auth/manager/plugins'
import { DEFAULT_ALIAS } from '../../consts.js'
import { OIDC_ADMIN_CLIENT, OIDC_TOKEN_STORE } from '../consts.js'
import { OIDC_CLIENT_AUTH } from '@owlmeans/oidc'
import { base64urlnopad as base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha256'
import Url from 'url'
import { ALL_SCOPES, AuthenFailed, AuthenPayloadError, AuthManagerError, AuthRole } from '@owlmeans/auth'
import type { AuthPayload } from '@owlmeans/auth'
import type { Resource } from '@owlmeans/resource'
import { AUTH_CACHE, AUTHEN_TIMEFRAME } from '@owlmeans/server-auth'
import type { OIDCAuthCache } from './types.js'
import { decodeJwt } from 'jose'

const verifierId = (challenge: string) => `verifier:${challenge}`
const exchangeId = (exchange: string) => `${OIDC_TOKEN_STORE}:${exchange}`

export const oidcClientPlugin = <C extends Config, T extends Context<C>>(context: T): AuthPlugin => {
  const cache = (context: T): Resource<OIDCAuthCache> =>
    context.resource<Resource<OIDCAuthCache>>(AUTH_CACHE)

  const plugin: AuthPlugin = {
    type: OIDC_CLIENT_AUTH,

    init: async request => {
      assertType(request.type, plugin)

      if (context.cfg.oidc.restrictedProviders === false) {
        throw new AuthManagerError('oidc.internal')
      }

      // @TODO Actually think about how to make oidc service configurable
      const oidc = context.service<OidcClientService>(DEFAULT_ALIAS)
      let entityId = request.entityId ?? oidc.getDefault()

      if (entityId == null) {
        throw new AuthenPayloadError('client.entity-id')
      }

      if (context.cfg.oidc.restrictedProviders === true && oidc.getDefault() !== entityId) {
        throw new AuthenPayloadError('client.entity-id')
      }
      if (Array.isArray(context.cfg.oidc.restrictedProviders)
        && !context.cfg.oidc.restrictedProviders.includes(entityId)) {
        throw new AuthenPayloadError('client.entity-id')
      }

      const verifier = base64.encode(randomBytes(32))
      const challenge = base64.encode(sha256(verifier))

      await cache(context).create({
        id: verifierId(challenge), verifier, client: entityId
      }, { ttl: AUTHEN_TIMEFRAME / 1000 })

      const client = await oidc.getClient(entityId)
      const cfg = await oidc.getConfig(entityId)
      const url = client.authorizationUrl({
        scope: `openid profile email ${cfg?.extraScopes ?? ''}`,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: request.source,
      })

      return { challenge: url }
    },

    authenticate: async credential => {


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

      if (tokenSet.id_token == null || tokenSet.access_token == null) {
        throw new AuthenFailed()
      }

      const exchangeToken = base64.encode(randomBytes(32))
      await cache(context).create(
        { id: exchangeId(exchangeToken), payload: tokenSet },
        { ttl: AUTHEN_TIMEFRAME / 1000 }
      )

      const jwt = decodeJwt(tokenSet.id_token)

      if (jwt.sub == null) {
        throw new AuthenFailed()
      }

      // const authJwt = decodeJwt(tokenSet.access_token)
      // console.log('Auth jwt', authJwt)

      const apiClient = await oidc.getClient(OIDC_ADMIN_CLIENT)
      const adminTokens = await apiClient.grant({ grant_type: 'client_credentials' })

      // console.log('Admin tokens', adminTokens)

      if (adminTokens.access_token == null) {
        throw new AuthManagerError('iam.admin')
      }

      const api = oidc.providerApi()
      let profile: AuthPayload | undefined = undefined
      if (api != null) {
        const deatails = await api.getUserDetails(adminTokens.access_token, jwt.sub!)
        await api.enrichUser(adminTokens.access_token, deatails)

        const store = oidc.accountLinking()
        if (store != null) {
          if (cfg.clientId == null) {
            throw new AuthManagerError('oidc.client.client-id')
          }
          profile = await store.linkAccount({
            userId: deatails.userId,
            entityId: deatails.entityId!,
            clientId: cfg.clientId,
            type: OIDC_CLIENT_AUTH,
          }, { username: jwt.preferred_username as string ?? deatails.username })
        }
      }

      // @TODO we need to do something with scopes - it's not secure
      credential.scopes = [ALL_SCOPES]
      credential.source = params.iss as string ?? credential.source
      credential.role = AuthRole.User
      credential.type = OIDC_CLIENT_AUTH
      credential.userId = profile?.userId ?? jwt.sub
      credential.profileId = profile?.profileId ?? jwt.sub
      credential.entityId = profile?.entityId ?? jwt.sub

      return { token: exchangeToken }
    }
  }

  return plugin
}
