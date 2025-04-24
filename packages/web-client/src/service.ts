
import { DEFAULT_ALIAS } from '@owlmeans/client-auth'
import type { AuthServiceAppend } from '@owlmeans/client-auth'
import type { AuthService } from '@owlmeans/auth-common'
import { makeAuthService } from '@owlmeans/client-auth'
import type { ClientModule } from '@owlmeans/client-module'
import { DISPATCHER } from '@owlmeans/auth'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { authMiddleware } from '@owlmeans/auth-common'

export const makeAuthWebService = (alias: string = DEFAULT_ALIAS): AuthService => {
  const service = makeAuthService(alias)

  const update = service.update
  service.update = async token => {
    await update(token)
    if (token == null) {
      const module = service.assertCtx().module<ClientModule<string>>(DISPATCHER)
      const [url] = await module.call()
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

  context.auth = () => ctx.service(service.alias)

  return context
}
