
import { elevate, stab } from '@owlmeans/client-entrypoint'
import { entrypoints as list } from '@owlmeans/auth-common'
import { CAUTHEN_FLOW_ENTER, DISPATCHER_AUTHEN } from '@owlmeans/auth'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'

elevate(list, DISPATCHER_AUTHEN)

export const entrypoints: ClientEntrypoint[] = list as ClientEntrypoint[]

export const setupExternalAuthentication = (service: string) => {
  elevate(list, CAUTHEN_FLOW_ENTER, stab, { routeOptions: { overrides: { service } } })
}
