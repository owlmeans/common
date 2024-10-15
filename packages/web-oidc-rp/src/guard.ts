import type { OidcGuardOptions } from '@owlmeans/oidc'
import type { Config, Context } from './types.js'
import type { CommonModule } from '@owlmeans/module'
import { 
  appendOidcGuard as appendBasicOidcGuard, 
  setupOidcGuard as setupBasicOidcGuard, 
  DISPATCHER_OIDC, DISPATCHER_OIDC_INIT 
} from '@owlmeans/oidc'
import { elevate } from '@owlmeans/web-client'

export const appendOidcGuard = <C extends Config, T extends Context<C>>(
  context: T, opts?: OidcGuardOptions
) => {
  const ctx = appendBasicOidcGuard<C, T>(context, opts)

  return ctx
}

export const setupOidcGuard = (modules: CommonModule[], coguards?: string | string[]) => {
  setupBasicOidcGuard(modules, coguards)
  
  elevate(modules, DISPATCHER_OIDC_INIT)
  elevate(modules, DISPATCHER_OIDC)
}
