
import { DISPATCHER } from '@owlmeans/auth'
import type { AuthService } from '@owlmeans/auth-common'
import { authMiddleware } from '@owlmeans/auth-common'
import type { AuthServiceAppend } from '@owlmeans/client-auth'
import { DEFAULT_ALIAS, makeAuthService } from '@owlmeans/client-auth'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { clientBaseOf } from '@owlmeans/client'
import { logoutMiddleware } from './middleware.js'

export const makeAuthWebService = (alias: string = DEFAULT_ALIAS): AuthService => {
  const service = makeAuthService(alias)

  const update = service.update
  service.update = async token => {
    await update(token)
    if (token == null) {
      const ctx = service.assertCtx()
      const module = ctx.entrypoint<ClientEntrypoint<string>>(DISPATCHER)
      // An in-app address is base-less; the page address carries the application's base. An
      // absolute one (the dispatcher of another service) is followed as it is.
      const url = clientBaseOf(ctx).href(await module.url())
      document.location.href = url
    }
  }

  return service
}

export const appendWebAuthService = <C extends ClientConfig, T extends ClientContext<C>>(
  ctx: T, alias: string = DEFAULT_ALIAS
): T & AuthServiceAppend => {
  const service = makeAuthWebService(alias)

  const context = ctx as T & AuthServiceAppend

  context.registerService(service)

  context.registerMiddleware(authMiddleware)
  context.registerMiddleware(logoutMiddleware)

  context.auth = () => ctx.service(service.alias)

  return context
}
