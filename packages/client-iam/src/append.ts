import type { AppConfig, AppContext } from '@owlmeans/web-client'
import type { WithSharedConfig } from '@owlmeans/oidc'
import { appendOidcGuard } from '@owlmeans/web-oidc-rp'

type IamClientConfig = AppConfig & WithSharedConfig
type IamClientContext<C extends IamClientConfig = IamClientConfig> = AppContext<C>

/**
 * One-call OIDC RP setup for a web client context.
 *
 * Replaces the explicit wiring pattern in the target template frontend:
 *   appendOidcGuard(context)
 *
 * The OIDC provider config (discovery URL, clientId, secret) is read from
 * context.cfg.oidc.providers[] — populate it before calling appendIam().
 */
export const appendIam = <C extends IamClientConfig, T extends IamClientContext<C>>(
  context: T
): T => {
  appendOidcGuard<C, T>(context)
  return context
}
