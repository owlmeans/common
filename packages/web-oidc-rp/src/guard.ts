import { DISPATCHER } from '@owlmeans/auth'
import { handler } from '@owlmeans/client'
import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import type { OidcGuardOptions } from '@owlmeans/oidc'
import {
  appendOidcGuard as appendBasicOidcGuard,
  DISPATCHER_OIDC, DISPATCHER_OIDC_INIT,
  setupOidcGuard as setupBasicOidcGuard
} from '@owlmeans/oidc'
import type { ParametrisedProps } from '@owlmeans/web-client'
import { elevate, parametriseDispatcher } from '@owlmeans/web-client'
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

export const setupOidcGuard = (modules: CommonEntrypoint[], coguards?: string | string[], extras?: Partial<ParametrisedProps>) => {
  const DispatcherCom = extras ? parametriseDispatcher(extras, Dispatcher) : Dispatcher

  setupBasicOidcGuard(modules, coguards)

  elevate(modules, DISPATCHER_OIDC_INIT)
  elevate(modules, DISPATCHER_OIDC)
  elevate(modules, DISPATCHER, handler(DispatcherCom), { force: true })
}
