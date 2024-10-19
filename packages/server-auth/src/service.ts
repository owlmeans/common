import type { ServerContext, ServerConfig } from '@owlmeans/server-context'
import { TRUSTED } from '@owlmeans/config'
import { AUTH_CACHE, AUTH_SRV_KEY, AUTHEN_TIMEFRAME, DEFAULT_ALIAS } from './consts.js'
import type { AuthServiceAppend, AuthService, AuthSpent } from './types.js'
import { assertContext, createService } from '@owlmeans/context'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { AuthenFailed, AuthroizationType } from '@owlmeans/auth'
import type { AbstractRequest, AbstractResponse } from '../../module/build/types.js'
import type { Resource } from '@owlmeans/resource'
import { createStaticResource } from '@owlmeans/static-resource'
import { trust, extractAuthToken } from '@owlmeans/auth-common/utils'

type Config = ServerConfig
type Context = ServerContext<Config>

export const makeAuthService = (alias: string = DEFAULT_ALIAS): AuthService => {
  const location = `server-auth:${alias}`

  const cache = (context: Context): Resource<AuthSpent> =>
    context.resource<Resource<AuthSpent>>(AUTH_CACHE)

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

      res.resolve(envelope.message())

      return true as T
    },

    authenticated: async () => {
      return null
    },

    authenticate: async token => {
      const context = assertContext<Config, Context>(service.ctx as Context, location)
      console.log(token)
      const envelope = makeEnvelopeModel<AuthCredentials>(token.token, EnvelopeKind.Token)

      const authService = await trust<Config, Context>(context, TRUSTED, AUTH_SRV_KEY)
      if (!await envelope.verify(authService.key)) {
        throw new AuthenFailed()
      }

      const credentials = envelope.message()
      const msg = credentials.challenge

      console.log('Authenticate credentials: ', credentials)

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
      const auth: Auth = {
        token: credentials.challenge,
        userId: credentials.userId,
        scopes: credentials.scopes,
        role: credentials.role,
        type: AuthroizationType.Ed25519BasicToken,
        source: context.cfg.service,
        profileId: credentials.profileId,
        entityId: credentials.entityId,
        isUser: true,
        createdAt: new Date()
      }

      const trusted = await trust<Config, Context>(context, TRUSTED, context.cfg.alias ?? context.cfg.service)
      const authorization = await makeEnvelopeModel<Auth>(AuthroizationType.Ed25519BasicToken)
        .send(auth, null).sign(trusted.key, EnvelopeKind.Token)

      return { token: `${AuthroizationType.Ed25519BasicToken.toUpperCase()} ${authorization}` }
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

  const service = makeAuthService(alias)
  console.log('Append auth service')
  const context = ctx as T & AuthServiceAppend

  context.registerService(service)
  context.auth = () => ctx.service(service.alias)

  return context
}
