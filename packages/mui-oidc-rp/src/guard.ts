import { handler } from '@owlmeans/client'
import type { OidcGuardOptions } from '@owlmeans/oidc'
import {
  appendOidcGuard as appendBasicOidcGuard,
  oidcProtocols,
} from '@owlmeans/oidc'
import type { ParametrisedProps } from '@owlmeans/web-client'
import { parametriseDispatcher } from '@owlmeans/web-client'
import { bind, bindScreen } from '@owlmeans/client-entrypoint'
import type { ClientProtocolEntrypoint } from '@owlmeans/client-entrypoint'
import { authProtocols } from '@owlmeans/auth-common'
import { Dispatcher } from './components/dispatcher.js'
import { makeOidcAuthService } from './service.js'
import type { Config, Context } from './types.js'

type OidcEntrypoint =
  | ClientProtocolEntrypoint<typeof oidcProtocols.init>
  | ClientProtocolEntrypoint<typeof oidcProtocols.authenticate>
  | ClientProtocolEntrypoint<typeof authProtocols.dispatcher>

export const appendOidcGuard = <C extends Config, T extends Context<C>>(
  context: T, opts?: OidcGuardOptions
) => {
  context.registerService(makeOidcAuthService())

  const ctx = appendBasicOidcGuard<C, T>(context, opts)

  return ctx
}

/** Browser-local OIDC handlers and dispatcher screen for MUI applications. */
export const oidcEntrypoints = (
  extras?: Partial<ParametrisedProps>
): OidcEntrypoint[] => {
  const DispatcherCom = extras ? parametriseDispatcher(extras, Dispatcher) : Dispatcher

  return [
    bind(oidcProtocols.init),
    bind(oidcProtocols.authenticate),
    bindScreen(authProtocols.dispatcher, handler(DispatcherCom)),
  ]
}
