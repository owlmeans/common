import type { OidcGuardOptions } from '@owlmeans/oidc'
import type { Config, Context } from './types.js'
import { 
  appendOidcGuard as appendBasicOidcGuard,
  oidcProtocols,
} from '@owlmeans/oidc'
import { bind } from '@owlmeans/server-entrypoint'
import * as actions from './actions/index.js'

export const appendOidcGuard = <C extends Config, T extends Context<C>>(
  context: T, opts?: OidcGuardOptions
) => {
  const ctx = appendBasicOidcGuard<C, T>(context, opts)

  return ctx
}

/** Server-local OIDC handlers for the shared OIDC protocol pair. */
export const oidcEntrypoints = [
  bind(oidcProtocols.init, actions.init),
  bind(oidcProtocols.authenticate, actions.authenticate),
]
