
import { elevate, stab } from '@owlmeans/client-module'
import { modules as list } from '@owlmeans/auth-common'
import { CAUTHEN_FLOW_ENTER, DISPATCHER_AUTHEN } from '@owlmeans/auth'
import type { ClientModule } from '@owlmeans/client-module'

elevate(list, DISPATCHER_AUTHEN)

export const modules: ClientModule[] = list as ClientModule[]

export const setupExternalAuthentication = (service: string) =>  {
  elevate(list, CAUTHEN_FLOW_ENTER, stab ,{ routeOptions: { overrides: { service } } })

  console.log(list)
}
