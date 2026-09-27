import type { ServerContext, ServerConfig } from '@owlmeans/server-context'
import { TRUSTED } from '@owlmeans/config'
import { AUTH_CACHE, AUTH_SRV_KEY, AUTHEN_TIMEFRAME, DEFAULT_ALIAS } from './consts.js'
import type { AuthServiceAppend, AuthService, AuthSpent } from './types.js'
import { assertContext, createService } from '@owlmeans/context'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { AuthenFailed, AuthorizationError, AuthroizationType, AuthUnavailable } from '@owlmeans/auth'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/entrypoint'
import type { Resource } from '@owlmeans/resource'
import { createStaticResource } from '@owlmeans/static-resource'
import { trust, extractAuthToken } from '@owlmeans/auth-common/utils'
import { ENTITY_RESOLVER } from '@owlmeans/auth-common'
import type { EntityResolverService } from '@owlmeans/auth-common'
import { AUTH_IDENTITY_PROFILE } from '@owlmeans/server-auth-identity'
import type { IdentityProfile, IdentityProfileResource } from '@owlmeans/server-auth-identity'
import {
  appendMemoryAuthSessionManager, AUTH_SESSION_MANAGER, AUTH_SESSION_TTL
} from '@owlmeans/server-auth-session'
import type { AuthSessionManager } from '@owlmeans/server-auth-session'
import { uuid } from '@owlmeans/basic-ids'
import { TOKEN_UPDATE } from '@owlmeans/auth-common'

type Config = ServerConfig
type Context = ServerContext<Config>

export const makeAuthService = (alias: string = DEFAULT_ALIAS): AuthService => {
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
    const trusted = await trust<Config, Context>(context, TRUSTED, context.cfg.alias ?? context.cfg.service)
    const ttl = auth.expiresAt == null ? AUTH_SESSION_TTL : Math.max(0, new Date(auth.expiresAt).getTime() - Date.now())
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

      const trusted = await trust<Config, Context>(context, TRUSTED, context.cfg.alias ?? context.cfg.service)
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

      const trusted = await trust<Config, Context>(context, TRUSTED, context.cfg.alias ?? context.cfg.service)
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

      const authService = await trust<Config, Context>(context, TRUSTED, AUTH_SRV_KEY)
      if (!await envelope.verify(authService.key)) {
        throw new AuthenFailed()
      }

      const credentials = envelope.message()
      const msg = credentials.challenge

      // @TODO This operation is not atomic in case of redis store usage and scling

      try {
        await cache(context).create({ id: msg }, { ttl: AUTHEN_TIMEFRAME / 1000 })
      } catch {
        throw new AuthenFailed()
      }

      if (credentials.credential !== authService.user.id) {
        throw new AuthenFailed()
      }

      // @TODO Move to a plugin
      const issuedAt = Date.now()
      const expiresAt = new Date(issuedAt + AUTH_SESSION_TTL)
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
        sessionId: uuid(),
        authorizationVersion: 1
      }
      const manager = sessions(context)
      if (manager != null) {
        const entityId = await entityIdFor(context, auth.entitySlug)
        if (entityId == null || auth.profileId == null) throw new AuthenFailed('session')
        const decision = await manager.register({
          id: auth.sessionId!, kind: 'bearer', entityId, profileId: auth.profileId,
          issuedAt, expiresAt: expiresAt.getTime()
        })
        if (decision.state !== 'active') throw new AuthenFailed('session')
        auth.authorizationVersion = decision.version
      }

      return { token: await sign(context, auth) }
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

  const service = makeAuthService(alias)
  const context = ctx as T & AuthServiceAppend

  context.registerService(service)
  context.auth = () => ctx.service(service.alias)

  return context
}
