import { handler } from '@owlmeans/client'
import type { OidcGuardOptions } from '@owlmeans/oidc'
import {
  appendOidcGuard as appendBasicOidcGuard,
  oidcProtocols,
} from '@owlmeans/oidc'
import type { ParametrisedProps } from '@owlmeans/web-client'
import { parametriseDispatcher } from '@owlmeans/web-client'
import { bind, bindScreen } from '@owlmeans/client-entrypoint'
import { authProtocols } from '@owlmeans/auth-common'
import { ensureLoginService } from '@owlmeans/client-auth/login'
import { Dispatcher } from './components/dispatcher.js'
import { oidcMethodSource } from './auth/methods.js'
import { makeOidcAuthService } from './service.js'
import type { Config, Context } from './types.js'

export const appendOidcGuard = <C extends Config, T extends Context<C>>(
  context: T, opts?: OidcGuardOptions
) => {
  context.registerService(makeOidcAuthService())

  const ctx = appendBasicOidcGuard<C, T>(context, opts)

  // The configured identity providers become sign-in methods on this context. Registered here
  // rather than globally because the provider list is a property of the application's config, and
  // an application that never wired the relying party must not be offered one.
  ensureLoginService(ctx).registerMethodSource(oidcMethodSource)

  return ctx
}

/** Browser-local OIDC handlers and dispatcher screen for the shared protocol declarations. */
export const oidcEntrypoints = (extras?: Partial<ParametrisedProps>) => {
  const DispatcherCom = extras ? parametriseDispatcher(extras, Dispatcher) : Dispatcher

  return [
    bind(oidcProtocols.init),
    bind(oidcProtocols.authenticate),
    bindScreen(authProtocols.dispatcher, handler(DispatcherCom)),
  ]
}
