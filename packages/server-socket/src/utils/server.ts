import type { CommonModule } from '@owlmeans/module'
import type { ServerModule } from '@owlmeans/server-module'
import { RouteProtocols } from '@owlmeans/route'
import { AppType } from '@owlmeans/context'
import type { Context } from '@owlmeans/server-api'

export const canServerModule = (context: Context, module: CommonModule): module is ServerModule<unknown> => {
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
