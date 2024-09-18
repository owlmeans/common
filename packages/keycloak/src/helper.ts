
import { elevate } from '@owlmeans/client-module'
import type { ClientModule } from '@owlmeans/client-module'
import { keycloakModules } from './modules.js'

export const elevateKeycloakModules = (service: string): ClientModule[] => {
  keycloakModules.map(module => {
    elevate(keycloakModules, module.alias, { routeOptions: { overrides: { service } } })
  })

  return keycloakModules as ClientModule[]
}
