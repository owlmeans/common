import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import { entrypoint, guard, filter, body } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod, service } from '@owlmeans/route'
import { authService } from './consts.js'
import { elevate } from '@owlmeans/client-entrypoint'
import { GUARD_ED25519 } from '@owlmeans/auth-common'
import { OIDCTokenUpdateSchema } from '@owlmeans/oidc'

export const setupAuthServiceModules = (
  modules: CommonEntrypoint[],
  serviceAlias: string,
  prefix: string = 'oidc-api'
) => {
  modules.push(
    entrypoint(
      route(authService.provider.list, `/${prefix}/provider/:service`, service(serviceAlias)),
      guard(GUARD_ED25519)
    ),
    entrypoint(
      route(
        authService.auth.update, `/${prefix}/auth/update`,
        backend(service(serviceAlias), RouteMethod.POST)
      ),
      filter(body(OIDCTokenUpdateSchema), guard(GUARD_ED25519))
    )
  )

  elevate(modules, authService.provider.list)
  elevate(modules, authService.auth.update)
}
