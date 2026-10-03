import type { RefedEntrypointHandler } from '@owlmeans/server-entrypoint'
import { handleBody } from '@owlmeans/server-api'
import type { OIDCClientAuthPayload } from '@owlmeans/oidc'
import { OIDC_WRAPPED_TOKEN, ORGANIZATIONS_CLAIM, PERMISSIONS_CLAIM } from '@owlmeans/oidc'
import { assertContext } from '@owlmeans/context'
import type { Config, Context } from '../types.js'
import Url from 'url'
import { makeOidcAuthentication } from '../utils/auth.js'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { AuthenFailed, AuthManagerError, AuthRole } from '@owlmeans/auth'
import { decodeJwt } from 'jose'
import { cache, exchangeId, managedId } from '../utils/cache.js'
import { OIDC_AUTH_LIFTETIME } from '../consts.js'
import { AUTH_SESSION_MANAGER } from '@owlmeans/server-auth-session'
import type { AuthSessionManager } from '@owlmeans/server-auth-session'
import { signWrapped, wrapper } from '../utils/wrapped.js'
import { extractPermissionSets } from '../utils/permissions.js'
import {
  actingAuth, actingPermissionSets, extractOrganizations, pickOrganization, resolvedEntityOf,
} from '../utils/organization.js'

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
export const authenticate: RefedEntrypointHandler = handleBody(async (
  { authUrl, ...params }: OIDCClientAuthPayload,
  ctx
) => {
  const context = assertContext<Config, Context>(ctx)

  const url = new Url.URL(authUrl)
  const redirectUrl = url.searchParams.get('redirect_uri')

  const [cfg, tokenSet, token, requested] = await makeOidcAuthentication(context)({
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

  // Only the id_token is guaranteed to be a JWT. An access token's format is provider-private —
  // `oidc-provider` issues opaque ones by default — so decoding it throws `JWTInvalid` and, from
  // inside this handler, fails the whole exchange after it has already succeeded. Nothing here
  // needs it either: the permission grant is read from the id_token below.
  const id = decodeJwt(tokenSet.id_token)

  // Integrated IAM mode: the provider mints the subject's PermissionSet[] into the id_token
  const sets = extractPermissionSets(id[PERMISSIONS_CLAIM])

  // A tenanted client also receives the subject's organizations. A client that never asked for
  // them gets no claim, and its session stays exactly what it was before tenancy: the descriptor's
  // entity on the token and no organization attached to its requests.
  const organizations = extractOrganizations(id[ORGANIZATIONS_CLAIM])
  const acting = organizations != null ? pickOrganization(organizations, { entitySlug: requested }) : undefined
  if (organizations != null && acting == null) {
    throw new AuthenFailed('entity')
  }
  // No bound set reaches a browser outside the organization it is bound to.
  const permissions = sets != null ? actingPermissionSets(sets) : undefined

  const issuedAt = Date.now()
  const expiresAt = issuedAt + OIDC_AUTH_LIFTETIME
  const entityId = cfg.entityId ?? cfg.clientId
  const profileId = typeof id.sub === 'string' && id.sub !== '' ? id.sub : null

  let user: Auth = {
    type: OIDC_WRAPPED_TOKEN,
    token,
    // @TODO Actually this is highly incorrect - we need to get profile details
    // from the OwlMeans Auth intead ?
    userId: profileId ?? '',
    profileId: profileId ?? undefined,
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
    entitySlug: cfg.entityId,
    ...(permissions != null ? { permissions, permissioned: true } : {}),
    isUser: true,
    createdAt: new Date(issuedAt),
    expiresAt: new Date(expiresAt),
  }
  if (acting != null) {
    user = actingAuth(user, acting, sets)
  }

  if (profileId == null) throw new AuthenFailed('subject')
  if (context.hasService(AUTH_SESSION_MANAGER)) {
    const decision = await context.service<AuthSessionManager>(AUTH_SESSION_MANAGER).register({
      // The integrated IAM service intentionally fences a whole organization profile. A grant
      // change in one target must also refresh an already-issued OIDC wrapper for that profile;
      // keeping this selector global makes disablement and every permission mutation converge.
      id: managedId(token), kind: 'oidc-access', entityId, profileId,
      issuedAt, expiresAt,
    })
    if (decision.state !== 'active') throw new AuthenFailed('session')
    user = { ...user, sessionId: managedId(token), authorizationVersion: decision.version }
  }

  await cache(context).create({
    id: managedId(token), payload: tokenSet, client: cfg.clientId, entityId, profileId, expiresAt,
    // The organizations and the raw sets stay here, server-side: the browser token carries only
    // the acting organization's slug, groups and flattened sets, and a switch re-reads these.
    ...(acting != null ? {
      acting: acting.entityKey, entity: resolvedEntityOf(acting), organizations,
      ...(sets != null ? { sets } : {}),
    } : {}),
  }, { ttl: OIDC_AUTH_LIFTETIME / 1000 })

  const issued = { token: await signWrapped(context, user) }

  // Only the token goes back: the entity the wrapper resolves carries the organization's key,
  // which never leaves the server.
  const updated = await wrapper(context).update(issued, true)

  return { token: updated?.token ?? issued.token }
})
