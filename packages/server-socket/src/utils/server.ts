import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
import { RouteProtocols } from '@owlmeans/route'
import { AppType } from '@owlmeans/context'
import type { Context } from '@owlmeans/server-api'

export const canServerModule = (context: Context, module: CommonEntrypoint): module is ServerEntrypoint<unknown> => {
  if (module.route.route.type !== AppType.Backend) {
    return false
  }

  if (module.route.route.service != null && module.route.route.service !== context.cfg.service) {
    return false
  }

  if (module.route.route.protocol !== RouteProtocols.SOCKET) {
    return false
  }

  return 'isIntermediate' in module.route
}
