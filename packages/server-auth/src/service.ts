import type { ServerContext } from '@owlmeans/server-context'
import { TRUSTED } from '@owlmeans/config'
import { AUTH_CACHE, AUTHEN_TIMEFRAME, DEFAULT_ALIAS } from './consts.js'
import type { AuthServiceAppend, AuthService, AuthSpent } from './types.js'
import { assertContext, createService } from '@owlmeans/context'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { type Auth, type AuthCredentials, AuthenFailed, AuthenticationType, AuthorizationError, AuthroizationType, AuthUnavailable } from '@owlmeans/auth'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/entrypoint'
import type { Resource } from '@owlmeans/resource'
import { createStaticResource } from '@owlmeans/static-resource'
import { trust, extractAuthToken } from '@owlmeans/auth-common/utils'
import { ENTITY_RESOLVER, type EntityResolverService, TOKEN_UPDATE } from '@owlmeans/auth-common'
import {
  accountStateOf, AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_PROFILE, type IdentityProfile, type IdentityProfileResource,
  type IdentityRefusal,
} from '@owlmeans/server-auth-identity'
import { appendMemoryAuthSessionManager, AUTH_SESSION_MANAGER, type AuthSessionManager } from '@owlmeans/server-auth-session'
import { idHelper } from '@owlmeans/basic-ids'
import { logger } from '@owlmeans/log'
import type { Config, Context } from './types.local.js'
import { authSettingsOf } from './settings.js'
import { appendAuthEventsService, authEvents } from './events.js'


const log = logger('server-auth')

export const makeAuthService = (alias: string = DEFAULT_ALIAS): AuthService => {
  /**
   * A refused token exchange — the manager's token presented to open a session. Logged with the
   * reason and the account id only; returns the error for the caller to throw.
   */
  const refuse = (reason: string, error: AuthenFailed, userId?: string): AuthenFailed => {
    const accountId = userId == null ? undefined
      : userId.includes('@') ? `*@${userId.slice(userId.lastIndexOf('@') + 1)}` : userId
    log.warn('Session exchange refused', { reason, ...(accountId != null ? { accountId } : {}) }, { event: 'auth.refused' })
    return error
  }

  const location = `server-auth:${alias}`

  const cache = (context: Context): Resource<AuthSpent> =>
    context.resource<Resource<AuthSpent>>(AUTH_CACHE)

  const sessions = (context: Context): AuthSessionManager | null =>
    context.hasService(AUTH_SESSION_MANAGER)
      ? context.service<AuthSessionManager>(AUTH_SESSION_MANAGER)
      : null

  const entityIdFor = async (context: Context, entitySlug: string | undefined): Promise<string | null> => {
    if (entitySlug == null || entitySlug === '') return null
    if (!context.hasService(ENTITY_RESOLVER)) return entitySlug
    const entity = await context.service<EntityResolverService>(ENTITY_RESOLVER).resolve(entitySlug)
    return entity?.id ?? null
  }

  const refresh = async (context: Context, auth: Auth, version: number): Promise<Auth | null> => {
    const entityId = await entityIdFor(context, auth.entitySlug)
    if (entityId == null || auth.profileId == null || !context.hasResource(AUTH_IDENTITY_PROFILE)) return null
    const profiles = context.resource<IdentityProfileResource>(AUTH_IDENTITY_PROFILE)
    let profile: IdentityProfile | null = null
    try {
      profile = await profiles.load({ entityId, profileId: auth.profileId })
    } catch {
      // A missing profile is a definitive authentication refusal; a failed profile store is an
      // availability dependency and must not look like a revoked browser session.
      throw new AuthUnavailable('identity-profile')
    }
    if (profile == null || (profile.expiresAt != null && new Date(profile.expiresAt).getTime() <= Date.now())) return null
    // A banned account, or the app's PRIMARY row disabled since the session began, ends it — the same
    // refusal the sign-in itself gives. Without the account store nothing says which row is primary.
    if (context.hasResource(AUTH_IDENTITY_ACCOUNT)) {
      let refusal: IdentityRefusal | null
      try {
        refusal = await accountStateOf(context).refusalOf(profile)
      } catch {
        throw new AuthUnavailable('identity-account')
      }
      if (refusal != null) {
        log.debug('Session refresh refused', { reason: refusal, profileId: auth.profileId }, { event: 'auth.refused' })
        return null
      }
    }
    return {
      ...auth,
      userId: profile.userId ?? auth.userId,
      role: profile.role,
      scopes: profile.scopes ?? [],
      ...(profile.permissions != null ? { permissions: profile.permissions } : {}),
      authorizationVersion: version,
      createdAt: new Date()
    }
  }

  const sign = async (context: Context, auth: Auth): Promise<string> => {
    const settings = authSettingsOf(context)
    const trusted = await trust<Config, Context>(context, TRUSTED, settings.tokenKey())
    const ttl = auth.expiresAt == null ? settings.sessionTtl() : Math.max(0, new Date(auth.expiresAt).getTime() - Date.now())
    const authorization = await makeEnvelopeModel<Auth>(AuthroizationType.Ed25519BasicToken)
      .send(auth, ttl).sign(trusted.key, EnvelopeKind.Token)
    return `${AuthroizationType.Ed25519BasicToken.toUpperCase()} ${authorization}`
  }

  const service: AuthService = createService<AuthService>(alias, {
    match: async req => extractAuthToken(req, AuthroizationType.Ed25519BasicToken) != null,

    handle: async <T>(req: AbstractRequest, res: AbstractResponse<Auth>) => {
      const context = assertContext(service.ctx) as Context
      const authorization = extractAuthToken(req, AuthroizationType.Ed25519BasicToken)
      if (authorization == null) {
        return false as T
      }

      const envelope = makeEnvelopeModel<Auth>(authorization, EnvelopeKind.Token)

      const trusted = await trust<Config, Context>(context, TRUSTED, authSettingsOf(context).tokenKey())
      if (!await envelope.verify(trusted.key)) {
        return false as T
      }

      let auth = envelope.message()
      const manager = sessions(context)
      if (manager != null) {
        if (auth.sessionId == null) return false as T
        let decision
        try {
          decision = await manager.inspect(auth.sessionId)
        } catch {
          // Registry availability is a security dependency. A guard cannot authenticate through it.
          throw new AuthUnavailable('session-registry')
        }
        if (decision.state !== 'active' && decision.state !== 'refresh') return false as T
        if (decision.state === 'refresh') {
          const refreshed = await refresh(context, auth, decision.version)
          if (refreshed == null) return false as T
          auth = refreshed
          const replacement = await sign(context, auth)
          res.responseProvider?.header(TOKEN_UPDATE, replacement)
          req.headers = { ...req.headers, authorization: replacement }
        }
      }

      res.resolve(auth)

      return true as T
    },

    unpack: async token => {
      const context = service.assertCtx<Config, Context>()
      const [, authorization] = token.split(' ')
      const envelope = makeEnvelopeModel<Auth>(authorization, EnvelopeKind.Token)

      const trusted = await trust<Config, Context>(context, TRUSTED, authSettingsOf(context).tokenKey())
      if (!await envelope.verify(trusted.key)) {
        throw new AuthorizationError('unpack')
      }
      const auth = envelope.message()
      const manager = sessions(context)
      if (manager != null) {
        if (auth.sessionId == null) throw new AuthorizationError('session')
        let decision
        try {
          decision = await manager.inspect(auth.sessionId)
        } catch {
          throw new AuthUnavailable('session-registry')
        }
        if (decision.state !== 'active') throw new AuthorizationError('session')
      }
      return auth
    },

    authenticated: async () => {
      return null
    },

    authenticate: async token => {
      const context = assertContext<Config, Context>(service.ctx as Context, location)
      const envelope = makeEnvelopeModel<AuthCredentials>(token.token, EnvelopeKind.Token)

      const settings = authSettingsOf(context)
      const authService = await trust<Config, Context>(context, TRUSTED, settings.authKey())
      if (!await envelope.verify(authService.key)) {
        throw refuse('signature', new AuthenFailed())
      }

      const credentials = envelope.message()
      const msg = credentials.challenge

      // A captcha token proves a solved challenge, never a person: it is spent by `makeCaptchaGuard`
      // on the one route that takes it and never becomes a session. Refused before the spend, so a
      // token presented here stays usable where it belongs.
      if (envelope.type() === AuthenticationType.Captcha || credentials.type === AuthenticationType.Captcha) {
        throw refuse('guest', new AuthenFailed('guest'), credentials.userId)
      }

      try {
        await cache(context).create({ id: msg }, { ttl: AUTHEN_TIMEFRAME / 1000 })
      } catch {
        throw refuse('replay', new AuthenFailed(), credentials.userId)
      }

      if (credentials.credential !== authService.user.id) {
        throw refuse('issuer', new AuthenFailed(), credentials.userId)
      }

      // @TODO Move to a plugin
      const issuedAt = Date.now()
      const expiresAt = new Date(issuedAt + settings.sessionTtl())
      const auth: Auth = {
        token: credentials.challenge,
        userId: credentials.userId,
        scopes: credentials.scopes,
        role: credentials.role,
        type: AuthroizationType.Ed25519BasicToken,
        source: context.cfg.service,
        profileId: credentials.profileId,
        entitySlug: credentials.entitySlug,
        isUser: true,
        createdAt: new Date(issuedAt),
        expiresAt,
        sessionId: idHelper.uuid(),
        authorizationVersion: 1
      }
      const manager = sessions(context)
      if (manager != null) {
        const entityId = await entityIdFor(context, auth.entitySlug)
        if (entityId == null || auth.profileId == null) throw refuse('session', new AuthenFailed('session'), auth.userId)
        const decision = await manager.register({
          id: auth.sessionId!, kind: 'bearer', entityId, profileId: auth.profileId,
          issuedAt, expiresAt: expiresAt.getTime()
        })
        if (decision.state !== 'active') throw refuse('session', new AuthenFailed('session'), auth.userId)
        auth.authorizationVersion = decision.version
      }

      const bearer = await sign(context, auth)
      // The session exists and its token is signed: the sign-in has happened. Listeners never fail it.
      await authEvents(context)?.propagateAuthenticated(auth)

      return { token: bearer }
    }
  })

  return service
}

export const appendAuthService = <C extends Config, T extends ServerContext<C>>(
  ctx: T, alias: string = DEFAULT_ALIAS
): T & AuthServiceAppend => {

  if (!ctx.hasResource(AUTH_CACHE)) {
    ctx.registerResource(createStaticResource(AUTH_CACHE))
  }

  // Every standalone server gets an expiring process-local registry. Scaled deployments replace
  // it with appendRedisAuthSessionManager before calling this helper.
  appendMemoryAuthSessionManager(ctx)
  // Behind `hasService`, so a deployment that registered its own events service first keeps it.
  appendAuthEventsService(ctx)

  const service = makeAuthService(alias)
  const context = ctx as T & AuthServiceAppend

  context.registerService(service)
  context.auth = () => ctx.service(service.alias)

  return context
}
