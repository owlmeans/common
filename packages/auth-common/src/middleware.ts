import type { Middleware } from '@owlmeans/context'
import { MiddlewareType, MiddlewareStage, AppType } from '@owlmeans/context'
import { provideRequest } from '@owlmeans/client-module'
import type { ClientModule } from '@owlmeans/client-module'
import { AUTH_HEADER } from '@owlmeans/auth'
import type { AbstractRequest, GuardService } from '@owlmeans/module'

export const authMiddleware: Middleware = {
  type: MiddlewareType.Context,
  stage: MiddlewareStage.Loading,
  apply: async context => {
    console.log('~ AUTH MIDDLEWARE ENGAGED ~')
    context.modules<ClientModule<unknown>>().map(module => {
      if (module.route.route.type === AppType.Backend && module.call != null) {
        const guards = module.getGuards()
        if (guards.length > 0) {
          console.log(' + ADD MODULE GUARD: ', module.alias, guards)
          // const auth = context.service<GuardService>(service)
          const call = module.call
          module.call = async (req, res) => {
            console.log(' > INTRODUCE AUTH MIDDLEWARE MODULE INTERCEPTION ', module.alias)
            // @TODO Actually we may use multiple authentication headers with the same name
            const [token] = (await Promise.all(guards.map(
              guard => context.service<GuardService>(guard).authenticated(req)
            ))).filter(token => token != null)
            if (token != null) {
              await module.resolve()
              const _req: Partial<AbstractRequest> = req ?? provideRequest(module.getAlias(), module.getPath())
              const headers = (_req.headers ?? {}) as Record<string, string | undefined>
              if (headers[AUTH_HEADER] == null) {
                headers[AUTH_HEADER] = token
                _req.headers = headers
                req = _req as typeof req
              }
            }

            return call(req, res)
          }
        }
      }
    })
  }
}
