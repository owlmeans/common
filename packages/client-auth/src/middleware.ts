import type { BasicConfig, BasicContext, Middleware } from '@owlmeans/context'
import { MiddlewareType, MiddlewareStage, AppType } from '@owlmeans/context'
import { provideRequest, type Module } from '@owlmeans/client-module'
import type { AuthService } from './types.js'
import { AUTH_HEADER } from '@owlmeans/auth'
import type { AbstractRequest } from '@owlmeans/module'

export const authMiddleware: Middleware = {
  type: MiddlewareType.Context,
  stage: MiddlewareStage.Loading,
  apply: async (context) => {
    context.modules<Module<unknown>>().map(module => {
      if (module.route.route.type === AppType.Backend && module.call != null) {
        const guards: string[] = []
        let _module: Module<unknown> | null = module
        do {
          guards.push(...(_module.guards ?? []))
          if (_module.hasParent()) {
            _module = context.module<Module<unknown>>(_module.getParentAlias() as string)
          } else {
            _module = null
          }
        } while (_module != null)
        const [service] = guards
        if (service != null) {
          // @TODO guards may have not compatible type with AuthService
          const auth = context.service<AuthService>(service)
          const call = module.call
          module.call = async (req, res) => {
            if (auth.authenticated()) {
              await module.route.resolve((module.ctx ?? context) as BasicContext<BasicConfig>)
              const _req: Partial<AbstractRequest> = req ?? provideRequest(module.getAlias(), module.getPath())
              // @TODO Authorization header may already present
              const headers = (_req.headers ?? {}) as Record<string, string | undefined>
              headers[AUTH_HEADER] = auth.token
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
