import type { AppConfig, AppContext } from '@owlmeans/web-client'
import type { WithSharedConfig } from '@owlmeans/oidc'
import { appendOidcGuard } from '@owlmeans/web-oidc-rp'
import { requireConsentForLogin } from './consent.js'
import type { ConsentLoginOptions } from './consent.js'

type IamClientConfig = AppConfig & WithSharedConfig
type IamClientContext<C extends IamClientConfig = IamClientConfig> = AppContext<C>

export interface AppendIamOptions {
  /** Consent required before a sign-in flow may start. `{ disabled: true }` turns it off. */
  consent?: ConsentLoginOptions
}

/**
 * One-call OIDC RP setup for a web client context.
 *
 * Replaces the explicit wiring pattern in the target template frontend:
 *   appendOidcGuard(context)
 *
 * The OIDC provider config (discovery URL, clientId, secret) is read from
 * context.cfg.oidc.providers[] — populate it before calling appendIam().
 *
 * It also installs the consent precondition, so every application gets the "confirm essential
 * cookies before signing in" rule from the line it already writes. An application that sets no
 * cookie at all passes `{ consent: { disabled: true } }`.
 */
export const appendIam = <C extends IamClientConfig, T extends IamClientContext<C>>(
  context: T, opts?: AppendIamOptions
): T => {
  appendOidcGuard<C, T>(context)
  requireConsentForLogin(context, opts?.consent)

  return context
}
