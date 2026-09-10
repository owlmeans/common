import type { Middleware } from '@owlmeans/context'
import { MiddlewareType, MiddlewareStage, AppType } from '@owlmeans/context'
import { provideRequest } from '@owlmeans/client-entrypoint'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { AUTH_HEADER } from '@owlmeans/auth'
import type { AbstractRequest, GuardService } from '@owlmeans/entrypoint'

export const authMiddleware: Middleware = {
  type: MiddlewareType.Context,
  stage: MiddlewareStage.Loading,
  apply: async context => {
    context.entrypoints<Perked>().forEach(module => {
      if (module.route.route.type === AppType.Backend && module.invoke != null) {
        if (module.getGuards().length > 0) {
          if (module._auth_common_middleware_applied === true) {
            return
          }
          module._auth_common_middleware_applied = true
          // Wrapping `invoke` covers `call` too: `call` reads `invoke` off the entrypoint at the
          // moment it runs, so both verbs carry the authentication header.
          const invoke = module.invoke
          module.invoke = (async req => {
            // @TODO Actually we may use multiple authentication headers with the same name
            // As I learnt its not always the case
            // Asked per call, not captured: an ancestor may have gained a guard since the
            // middleware wrapped this entrypoint.
            const [token] = (await Promise.all(module.getGuards().map(
              guard => context.service<GuardService>(guard).authenticated(req)
            ))).filter(token => token != null).reverse()
            if (token != null) {
              const _req: Partial<AbstractRequest> = req ?? provideRequest(module.alias, module.path())
              const headers = (_req.headers ?? {}) as Record<string, string | undefined>
              if (headers[AUTH_HEADER] == null) {
                headers[AUTH_HEADER] = token
                _req.headers = headers
                req = _req as typeof req
              }
            }

            return invoke(req)
          }) as typeof module.invoke

        }
      }
    })
  }
}

interface Perked extends ClientEntrypoint<unknown> {
  _auth_common_middleware_applied?: boolean
}
