import type { Middleware } from '@owlmeans/context'
import { MiddlewareType, MiddlewareStage, AppType } from '@owlmeans/context'
import type { ClientModule } from '@owlmeans/client-module'
import { AuthUnknown } from '@owlmeans/auth'
import { ResilientError } from '@owlmeans/error'
import { DEFAULT_ALIAS } from '@owlmeans/client-auth'
import { AuthService } from '@owlmeans/auth-common'

export const logoutMiddleware: Middleware = {
  type: MiddlewareType.Context,
  stage: MiddlewareStage.Loading,
  apply: async context => {
    context.modules<Perked>().forEach(module => {
      if (module.route.route.type === AppType.Backend && module.call != null) {
        const guards = module.getGuards()
        if (guards.length > 0) {
          if (module._auth_web_middleware_applied === true) {
            return
          }
          module._auth_web_middleware_applied = true
          // const auth = context.service<GuardService>(service)
          const call = module.call
          module.call = async (req, res) => {
            try {
              return await call(req, res)
            } catch (e) {
              if (e instanceof Error) {
                const err = ResilientError.ensure(e)
                if (err instanceof AuthUnknown) {
                  if (err.message.endsWith(':invalid')) {
                    if (typeof window !== 'undefined') {
                      const auth = context.service<AuthService>(DEFAULT_ALIAS)
                      await auth.update(undefined)
                      throw err
                    }
                  }
                }
              }
              throw e
            }
          }

        }
      }
    })
  }
}

interface Perked extends ClientModule<unknown> {
  _auth_web_middleware_applied?: boolean
}
