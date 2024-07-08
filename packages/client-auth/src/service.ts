import type { AuthService, AuthServiceAppend } from './types.js'
import { DEFAULT_ALIAS } from './consts.js'
import { assertContext, createService } from '@owlmeans/context'
import type { ClientContext, ClientConfig } from '@owlmeans/client-context'
import { AuthorizationError, DISPATCHER_AUTHEN } from '@owlmeans/auth'
import type { Auth, AuthToken } from '@owlmeans/auth'
import { ClientModule } from '@owlmeans/client-module'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { authMiddleware } from './middleware.js'

export const makeAuthService = (alias: string = DEFAULT_ALIAS): AuthService => {
  const location = `auth-service:${alias}`
  const service: AuthService = createService<AuthService>(alias, {
    match: async () => service.authenticated(),

    handle: async <T>() => {
      return void 0 as T
    },

    authenticate: async token => {
      const ctx = assertContext(service.ctx, location)

      const [authToken] = await ctx!.module<ClientModule<AuthToken>>(DISPATCHER_AUTHEN).call({ body: token })

      const [, authorization] = authToken.token.split(' ')

      const envelope = makeEnvelopeModel(authorization, EnvelopeKind.Token)

      service.auth = envelope.message<Auth>()

      service.token = authToken.token
    },

    authenticated: () => service.token != null,

    user: () => {
      if (service.auth == null) {
        throw new AuthorizationError()
      }

      return service.auth
    }
  }, service => async () => { service.initialized = true })

  return service
}

export const appendAuthService = <C extends ClientConfig, T extends ClientContext<C>>(
  ctx: T, alias: string = DEFAULT_ALIAS
): T & AuthServiceAppend => {
  const service = makeAuthService(alias)
  console.log('Append auth service')

  const context = ctx as T & AuthServiceAppend

  context.registerService(service)

  context.registerMiddleware(authMiddleware)
  
  context.auth = () => ctx.service(service.alias)

  return context
}
