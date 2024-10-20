import type { AuthServiceAppend, ClientAuthRecord } from './types.js'
import type { AuthService } from '@owlmeans/auth-common'
import { AUTH_RESOURCE, DEFAULT_ALIAS, USER_ID } from './consts.js'
import { assertContext, createService } from '@owlmeans/context'
import type { ClientContext, ClientConfig } from '@owlmeans/client-context'
import { AuthorizationError, DISPATCHER_AUTHEN } from '@owlmeans/auth'
import type { Auth, AuthToken } from '@owlmeans/auth'
import type { ClientModule } from '@owlmeans/client-module'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { authMiddleware } from '@owlmeans/auth-common'

export const makeAuthService = (alias: string = DEFAULT_ALIAS): AuthService => {
  const location = `auth-service:${alias}`
  const service: AuthService = createService<AuthService>(alias, {
    match: async () => service.authenticated() != null,

    handle: async <T>() => {
      return void 0 as T
    },

    authenticate: async token => {
      const context = assertContext(service.ctx, location)

      const [authToken] = await context.module<ClientModule<AuthToken>>(DISPATCHER_AUTHEN)
        .call({ body: token })

      const authResource = service.store<ClientAuthRecord>()
      await authResource.save({ id: USER_ID, token: authToken.token })

      const [, authorization] = authToken.token.split(' ')
      const envelope = makeEnvelopeModel<Auth>(authorization, EnvelopeKind.Token)

      service.auth = envelope.message()

      service.token = authToken.token
    },

    authenticated: async () => {
      if (service.token == null) {
        const authResource = service.store<ClientAuthRecord>()
        const record = await authResource.load(USER_ID)

        if (record != null) {
          const token = record.token

          const [, authorization] = token.split(' ')
          service.token = token

          const envelope = makeEnvelopeModel<Auth>(authorization, EnvelopeKind.Token)

          service.auth = envelope.message()
        }
      }

      return service.token ?? null
    },

    user: () => {
      if (service.auth == null) {
        throw new AuthorizationError()
      }

      return service.auth
    },

    store: () => service.assertCtx(location).resource(AUTH_RESOURCE)
  })

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
