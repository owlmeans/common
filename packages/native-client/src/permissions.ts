import { Platform } from 'react-native'
import { assertContext, createService } from '@owlmeans/context'
import { PERMSSIONS_ALIAS } from './consts'
import { plugins } from './permissions/index.js'
import type { AppContext, PermissionService } from './types.js'
import { STAB_PLUGIN } from './permissions/consts'
import { openSettings } from 'react-native-permissions'

export const makePermissionService = (): PermissionService => {
  const location = 'os-permission-service'

  const service: PermissionService = createService<PermissionService>(PERMSSIONS_ALIAS, {
    granted: async permission => service.plugin.granted(permission),
    requestable: async permission => service.plugin.requestable(permission),
    request: async permission => service.plugin.request(permission),
    supported: async permission => service.plugin.supported(permission),
    settings: async () => openSettings()
  }, service => async () => {
    const context = assertContext(service.ctx, location) as AppContext

    service.plugin = (
      plugins[Platform.OS] != null ? plugins[Platform.OS] : plugins[STAB_PLUGIN]
    )(context)

    context.permissions = () => service

    service.initialized = true
  })

  return service
}
