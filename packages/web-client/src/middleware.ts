import type { Middleware } from '@owlmeans/context'
import { MiddlewareType, MiddlewareStage, AppType } from '@owlmeans/context'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { AuthUnknown } from '@owlmeans/auth'
import { ResilientError } from '@owlmeans/error'
import { DEFAULT_ALIAS } from '@owlmeans/client-auth'
import { AuthService } from '@owlmeans/auth-common'

export const logoutMiddleware: Middleware = {
  type: MiddlewareType.Context,
  stage: MiddlewareStage.Loading,
  apply: async context => {
    context.entrypoints<Perked>().forEach(module => {
      if (module.route.route.type === AppType.Backend && module.invoke != null) {
        const guards = module.getGuards()
        if (guards.length > 0) {
          if (module._auth_web_middleware_applied === true) {
            return
          }
          module._auth_web_middleware_applied = true
          // Wrapping `invoke` covers `call` too: `call` reads `invoke` off the entrypoint at the
          // moment it runs, so a rejected session is caught whichever verb the caller used.
          const invoke = module.invoke
          module.invoke = (async req => {
            try {
              return await invoke(req)
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
          }) as typeof module.invoke

        }
      }
    })
  }
}

interface Perked extends ClientEntrypoint<unknown> {
  _auth_web_middleware_applied?: boolean
}
