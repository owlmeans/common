import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import type { EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod, service } from '@owlmeans/route'
import { authService } from './consts.js'
import { GUARD_ED25519 } from '@owlmeans/auth-common'
import { OIDCTokenUpdateSchema } from '@owlmeans/oidc'

export const makeAuthServiceEntrypoints = (
  serviceAlias: string,
  prefix: string = 'oidc-api'
): EntrypointProtocolDeclaration[] => [
  openProtocol(
    route(authService.provider.list, `/${prefix}/provider/:service`, service(serviceAlias)),
    { guards: GUARD_ED25519 },
  ),
  protocol(
    route(
      authService.auth.update, `/${prefix}/auth/update`,
      backend(service(serviceAlias), RouteMethod.POST),
    ),
    contract.request({ body: typed(OIDCTokenUpdateSchema) }, typed<any>()),
    { guards: GUARD_ED25519 },
  ),
]
