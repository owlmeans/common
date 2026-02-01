import { DISPATCHER } from '@owlmeans/auth'
import { handler } from '@owlmeans/client'
import type { CommonModule } from '@owlmeans/module'
import type { OidcGuardOptions } from '@owlmeans/oidc'
import {
  appendOidcGuard as appendBasicOidcGuard,
  DISPATCHER_OIDC, DISPATCHER_OIDC_INIT,
  setupOidcGuard as setupBasicOidcGuard
} from '@owlmeans/oidc'
import type { ParametrisedProps } from '@owlmeans/web-client'
import { elevate, parametriseDispatcher } from '@owlmeans/web-client'
import { Dispatcher } from './components/dispatcher.js'
import { makeOidcAuthService } from './service.js'
import type { Config, Context } from './types.js'

export const appendOidcGuard = <C extends Config, T extends Context<C>>(
  context: T, opts?: OidcGuardOptions
) => {
  context.registerService(makeOidcAuthService())

  const ctx = appendBasicOidcGuard<C, T>(context, opts)

  return ctx
}

export const setupOidcGuard = (modules: CommonModule[], coguards?: string | string[], extras?: Partial<ParametrisedProps>) => {
  const DispatcherCom = extras ? parametriseDispatcher(extras, Dispatcher) : Dispatcher

  setupBasicOidcGuard(modules, coguards)

  elevate(modules, DISPATCHER_OIDC_INIT)
  elevate(modules, DISPATCHER_OIDC)
  elevate(modules, DISPATCHER, handler(DispatcherCom), { force: true })
}
