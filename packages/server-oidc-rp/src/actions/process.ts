import type { RefedModuleHandler } from '@owlmeans/server-module'
import { handleBody } from '@owlmeans/server-api'
import type { OIDCClientAuthPayload } from '@owlmeans/oidc'
import { OIDC_WRAPPED_TOKEN } from '@owlmeans/oidc'
import { assertContext } from '@owlmeans/context'
import type { Config, Context } from '../types.js'
import Url from 'url'
import { makeOidcAuthentication } from '../utils/auth.js'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { AuthenFailed, AuthManagerError, AuthRole } from '@owlmeans/auth'
import { decodeJwt } from 'jose'
import { cache, exchangeId, managedId } from '../utils/cache.js'
import { trust } from '@owlmeans/auth-common/utils'
import { TRUSTED } from '@owlmeans/config'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { OIDC_AUTH_LIFTETIME } from '../consts.js'
import { wrapper } from '../utils/wrapped.js'

/**
 * Authentication method links together OIDC and OwlMeans auth.
 * 1. We authenticate OIDC redirect back params with the classic OIDC client.
 * 2. We temporary store on the server refresh token and OIDC token.
 * 3. We supply the client with perked OwlMeans Auth token that in fact
 * is the set of OIDC tokens (except refresh token - we keep it here?)
 * 4. We used it in a centralized way to check permissions over OwlMeans Auth
 * central service irrespectively is it OIDC or our custom permissions engine
 * (this is useful to properly support paid accounts and bridge the underlying
 * IAM system implemetation - abstract from it).
 * 5. The method ends with production of OwlMeans authorization token.
 * 
 * ! There is also token renewal mechanism that should be implemented nearby.
 */
export const authenticate: RefedModuleHandler = handleBody(async (
  { authUrl, ...params }: OIDCClientAuthPayload,
  ctx
) => {
  const context = assertContext<Config, Context>(ctx)

  const url = new Url.URL(authUrl)
  const redirectUrl = url.searchParams.get('redirect_uri')

  const [cfg, tokenSet, token] = await makeOidcAuthentication(context)({
    challenge: redirectUrl + ':' + authUrl,
    credential: new Url.URLSearchParams(params).toString()
  } as AuthCredentials)

  if (tokenSet.id_token == null || tokenSet.access_token == null) {
    throw new AuthenFailed()
  }

  if (cfg.service == null) {
    throw new AuthManagerError('service')
  }

  await cache(context).delete(exchangeId(token))

  console.log(
    'List provided user permisssions',
    decodeJwt(tokenSet.access_token)
  )

  const id = decodeJwt(tokenSet.id_token)
  console.log(
    'token set',
    tokenSet,
    tokenSet.claims(),
    id
  )

  let user: Auth = {
    type: OIDC_WRAPPED_TOKEN,
    token,
    // @TODO Actually this is highly incorrect - we need to get profile details
    // from the OwlMeans Auth intead ?
    userId: id.sub as string,
    // @TODO Actually we should check is it user or admin or even guest
    // and set proper role
    role: AuthRole.Guest,
    // @TODO It's unclear if it's secure - but it's not used right now
    scopes: [
      ...(context.cfg.shortAlias != null ? [context.cfg.shortAlias] : []),
      ...(context.cfg.alias != null ? [context.cfg.alias] : []),
      context.cfg.service,
      cfg.service,
    ],
    source: `${cfg.service}/${cfg.clientId}${'id' in cfg ? `/${cfg.id}` : ''}`,
    // @TODO Actually this is highly incorrect - we need to get profile details
    // from the OwlMeans Auth intead
    // profileId: user?.userId,
    entityId: cfg.entityId,
    isUser: true,
    createdAt: new Date(),
  }

  console.log('>>>>> ~~~~~ STORE RECORD WITH ID: ', managedId(token))
  await cache(context).create(
    { id: managedId(token), payload: tokenSet, client: cfg.clientId },
    { ttl: OIDC_AUTH_LIFTETIME / 1000 }
  )

  const trusted = await trust<Config, Context>(context, TRUSTED, context.cfg.alias ?? context.cfg.service)
  const authorization = await makeEnvelopeModel<Auth>(OIDC_WRAPPED_TOKEN)
    .send(user, null).sign(trusted.key, EnvelopeKind.Token)

  let auth = { token: `${OIDC_WRAPPED_TOKEN.toUpperCase()} ${authorization}` }

  auth = await wrapper(context).update(auth, true) ?? auth

  return auth
})
