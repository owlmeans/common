import type { AuthService, AuthServiceAppend, Context, ContextType } from './types.js'
import { DEFAULT_ALIAS } from './consts.js'
import { createService } from '@owlmeans/context'
import type { UpdContextType } from '@owlmeans/context'
import type { Config } from '@owlmeans/client-context'
import { AuthorizationError, DISPATCHER_AUTHEN } from '@owlmeans/auth'
import type { Auth, AuthToken } from '@owlmeans/auth'
import { Module } from '@owlmeans/client-module'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'

export const makeAuthService = (alias: string = DEFAULT_ALIAS): AuthService => {
  const service: AuthService = createService<AuthService>(alias, {
    match: async () => service.authenticated(),

    handle: async <T>() => {
      return void 0 as T
    },

    authenticate: async token => {
      const ctx = service.ctx as Context
      const [authToken] = await ctx.module<Module<AuthToken>>(DISPATCHER_AUTHEN).call({ body: token })

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

export const appendAuthService = <C extends ContextType<Config>>(
  ctx: C, alias: string = DEFAULT_ALIAS
): UpdContextType<C, AuthServiceAppend> => {
  const service = makeAuthService(alias)
  console.log('Append auth service')
  const context = ctx as UpdContextType<C, AuthServiceAppend>

  context.registerService(service)
  context.auth = () => ctx.service(service.alias)

  return context
}
