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
        const [service] = guards
        if (service != null) {
          console.log(' + ADD MODULE GUARD: ', module.alias, service)
          const auth = context.service<GuardService>(service)
          const call = module.call
          module.call = async (req, res) => {
            console.log(' > INTRODUCE AUTH MIDDLEWARE MODULE INTERCEPTION ', module.alias)
            const token = await auth.authenticated(req)
            if (token != null) {
              // @TODO Just use await module.resolve() - cause the following construction can lead to wrong module resolution
              // await module.route.resolve((module.ctx ?? context) as BasicContext<BasicConfig>)
              await module.resolve()
              const _req: Partial<AbstractRequest> = req ?? provideRequest(module.getAlias(), module.getPath())
              // @TODO Authorization header may be already present
              const headers = (_req.headers ?? {}) as Record<string, string | undefined>
              headers[AUTH_HEADER] = token
              _req.headers = headers
              req = _req as typeof req
            }

            return call(req, res)
          }
        }
      }
    })
  }
}
