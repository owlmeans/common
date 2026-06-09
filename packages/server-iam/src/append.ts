import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { WithSharedConfig } from '@owlmeans/oidc'
import { appendOidcGuard, makeOidcClientService, makeOidcGate, makeOidcWrappingService } from '@owlmeans/server-oidc-rp'

type IamServerConfig = ServerConfig & WithSharedConfig
type IamServerContext<C extends IamServerConfig = IamServerConfig> = ServerContext<C>

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
  context.registerService(makeOidcGate())
  appendOidcGuard<C, T>(context)
  return context
}
