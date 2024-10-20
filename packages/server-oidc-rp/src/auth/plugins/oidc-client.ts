
import type { AuthPlugin } from '@owlmeans/server-auth/manager/plugins'
import type { Config, Context, OidcClientService } from '../../types.js'
import { assertType } from '@owlmeans/server-auth/manager/plugins'
import { DEFAULT_ALIAS } from '../../consts.js'
import { OIDC_CLIENT_AUTH } from '@owlmeans/oidc'
import type { OidcUserDetails } from '@owlmeans/oidc'
import { base64urlnopad as base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha256'
import { ALL_SCOPES, AuthenFailed, AuthenPayloadError, AuthManagerError, AuthRole } from '@owlmeans/auth'
import { AUTHEN_TIMEFRAME } from '@owlmeans/server-auth'
import { decodeJwt } from 'jose'
import { KEY_OWL } from '@owlmeans/did'
import { cache, verifierId } from '../../utils/cache.js'
import { makeOidcAuthentication } from '../../utils/auth.js'
// import { URL } from 'url'

/**
 * Actually the most of implementation desceibed here is a proprietary one and 
 * located within OwlMeans Auth service implmentation.
 * We keep it here for easier code navigation and understanding of relying developers
 * about what's going on but we can't show it.
 * 
 * @See OwlMeans Auth {AccountLinkingService} interface implementation for more details
 * 
 * We need to distinguish the following cases:
 * 1. The user authenticates via owlmenas.org
 *  1.1. The user authenticated in owlmeans.org via IAM product based account.
 *     1.1.1. The user do it for the first time
 *          * We create an account
 *          * We create and link credentials from jwt to the account (i'm not sure if it's required)
 *          * We create the profile
 *          * We create and link credentials from jwt to the profile
 *     1.1.2. The user do it not for the first time
 *          * We found the linked profile by jwt
 *  1.2. The user autehnticated in owlmeans.org via OwlMeans ID
 *     1.2.1. The user do it for the first time
 *          * Figure out if the user has OwlMeans ID linked to the authentication from jwt
 *            (GET /admin/realms/{realm}/users/{id}/federated-identity)
 *          * We create and link credentials from jwt to the profile
 *     1.2.2. The user do it not for the first time
 *          * We found the linked profile by credentials from jwt
 * 2. The user authenticates via a custom identity provider
 *  2.1. The user auhtneticated in his identity provier directly
 *     2.1.1. The user do it for the first time
 *          * We create a profile (we cant request info about his Owlmeans id)!
 *          * We create and link credentials from jwt to the profile
 *          * ! When the user will try to pay for something via this profile
 *          *   we need to force him to link it to owlmeans.org profile / account.
 *     2.1.2. The user do it not for the first time
 *          * We found the linked profile by jwt
 *  2.2. The user authenticated in his identity provider via OwlMeans ID
 *     - This case actually shouldn't know anything about it until the profile is linked to the 
 *       owlmeans.org acccount.
 *
 *  Generailized
 *  1. We try to get credentials
 *  2. If there is no credentials we try to get more info abou the user
 *  2.1. To do it we get admin client if it's presented for API access
 *  2.2. If it's presented we get list of identity providers to figure out if there an owlmeans.org id
 *  3. If there is no owlmeans.org account while the login is going through it - we create one
 *  4. If there is no profile - we create one and link oidc credentials
 */
export const oidcClientPlugin = <C extends Config, T extends Context<C>>(context: T): AuthPlugin => {
  const authenticate = makeOidcAuthentication<C, T>(context)

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
        throw new AuthenPayloadError('client')
      }

      if (context.cfg.oidc.restrictedProviders === true && oidc.getDefault() !== entityId) {
        throw new AuthenPayloadError('client')
      }
      if (Array.isArray(context.cfg.oidc.restrictedProviders)
        && !context.cfg.oidc.restrictedProviders.includes(entityId)) {
        throw new AuthenPayloadError('client')
      }

      const verifier = base64.encode(randomBytes(32))
      const challenge = base64.encode(sha256(verifier))

      await cache<C, T>(context).create({
        id: verifierId(challenge), verifier, client: entityId
      }, { ttl: AUTHEN_TIMEFRAME / 1000 })

      if (request.source == null) {
        throw new AuthenPayloadError('redirect-uri')
      }

      // const redirectUrl = new URL(request.source)

      // for (let key of redirectUrl.searchParams.keys()) {
      //   redirectUrl.searchParams.delete(key)
      // }

      const client = await oidc.getClient(entityId)
      const cfg = client.getConfig()
      const url = client.makeAuthUrl({
        scope: `openid profile email ${cfg?.extraScopes ?? ''}`,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: request.source,
      })

      return { challenge: url }
    },

    authenticate: async credential => {
      console.log('000000000000000')
      const [cfg, tokenSet, exchangeToken] = await authenticate(credential)

      if (tokenSet.id_token == null || tokenSet.access_token == null) {
        throw new AuthenFailed()
      }

      const oidc = context.service<OidcClientService>(DEFAULT_ALIAS)
      const jwt = decodeJwt(tokenSet.id_token)

      if (jwt.sub == null) {
        throw new AuthenFailed()
      }

      const store = oidc.accountLinking()
      if (store == null) {
        throw new AuthManagerError('oidc.account.store')
      }

      let profile = await store.getLinkedProfile({
        type: OIDC_CLIENT_AUTH,
        clientId: cfg.clientId,
        userId: jwt.sub
      })

      // @TODO It's likely the case when we are talking about owlmeans.org
      // but some addtional checks need to be done.
      // The problem is that we will make the sold identity providers also
      // managable, so this condition isn't enough to cover described cases.
      let details: OidcUserDetails
      if (cfg.apiClientId != null) {
        console.log(1)
        const apiClient = await oidc.getClient(cfg.apiClientId)
        const adminTokens = await apiClient.grantWithCredentials()
        if (adminTokens.access_token == null) {
          throw new AuthManagerError('iam.admin')
        }
        const api = oidc.providerApi()
        if (api == null) {
          // @TODO And what if don't? Probably we can still do something here
          throw new AuthManagerError('iam.admin.api')
        }
        details = await api.getUserDetails(adminTokens.access_token, jwt.sub)
      } else {
        // @TODO We need to do something here if it's an external identity provider
        // and we couldn't get any addiontal info
        throw new AuthManagerError('implemented')
      }

      if (
        // Create profile
        profile == null
        // Fix profile if it's not linked properly to OwlMeans Id
        || (details.did != null && details.isOwlMeansId && !profile.profileId?.startsWith(KEY_OWL + ':'))
      ) {
        console.log(2)
        details.isOwlMeansId ??= cfg.entityId != null && cfg.entityId === context.cfg.defaultEntityId
        if (details.isOwlMeansId && context.cfg.defaultEntityId == null) {
          throw new AuthManagerError('iam.governance')
        }
        details.entityId = details.isOwlMeansId ? context.cfg.defaultEntityId : cfg.entityId
        if (details.entityId == null) {
          // @TODO We doesn't support clients and entites that aren't bound to an organization
          // right now. Probably we should. Probably there are some cases when we have to.
          throw new AuthManagerError('iam.entity')
        }

        // We relink existing profile only if it's not yet did bound
        // and the orgnaization is owlmeans.org
        if (profile == null || details.entityId === context.cfg.defaultEntityId) {
          console.log(3)
          profile = await store.linkProfile({
            ...details,
            clientId: cfg.clientId,
            type: OIDC_CLIENT_AUTH,
          }, { username: jwt.preferred_username as string ?? details.username })
        }
      }
      console.log(4)

      credential.scopes = [ALL_SCOPES]
      credential.source = cfg.clientId
      credential.role = AuthRole.User
      credential.type = OIDC_CLIENT_AUTH
      credential.userId = profile.userId
      credential.profileId = profile.profileId
      credential.entityId = profile.entityId

      return { token: exchangeToken }
    }
  }

  return plugin
}
