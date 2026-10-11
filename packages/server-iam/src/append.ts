import { appendOidcGuard, makeOidcClientService, makeOidcWrappingService } from '@owlmeans/server-oidc-rp'
import { makeIamGate } from './gate.js'
import type { IamServerConfig, IamServerContext } from './types.local.js'


/**
 * One-call OIDC RP setup for a server context.
 *
 * Replaces the explicit wiring pattern in the target template:
 *   context.registerService(makeOidcClientService())
 *   context.registerService(makeOidcWrappingService())
 *   context.registerService(makeOidcGate())
 *   appendOidcGuard(context)
 *
 * The OIDC provider config (discovery URL, clientId, secret) is read from
 * context.cfg.oidc.providers[] — populate it before calling appendIam().
 */
export const appendIam = <C extends IamServerConfig, T extends IamServerContext<C>>(
  context: T
): T => {
  context.registerService(makeOidcClientService())
  context.registerService(makeOidcWrappingService())
  // IAM gate under the OIDC_GATE alias: claims-first (integrated mode),
  // UMA2 fallback byte-equivalent to makeOidcGate (keycloak mode)
  context.registerService(makeIamGate())
  appendOidcGuard<C, T>(context)
  return context
}
