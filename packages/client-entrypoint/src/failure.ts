import { createLazyService, type BasicContext } from '@owlmeans/context'
import { logger } from '@owlmeans/log'
import { ENTRYPOINT_FAILURE_SERVICE } from './consts.js'
import type { EntrypointFailurePlugin, EntrypointFailureService } from './types.js'

const log = logger('client-entrypoint')

/** Context-local observers for rejected client calls; observers never replace the thrown error. */
export const ensureEntrypointFailureService = (ctx: BasicContext<any>): EntrypointFailureService => {
  if (ctx.hasService(ENTRYPOINT_FAILURE_SERVICE)) {
    return ctx.service<EntrypointFailureService>(ENTRYPOINT_FAILURE_SERVICE)
  }
  const plugins = new Map<string, EntrypointFailurePlugin>()
  const service = createLazyService<EntrypointFailureService>(ENTRYPOINT_FAILURE_SERVICE, {
    registerPlugin: plugin => { plugins.set(plugin.alias, plugin) },
    notify: async failure => {
      for (const plugin of plugins.values()) {
        try { await plugin.onFailure(failure) } catch (cause) {
          log.warn('Entrypoint failure observer failed', { plugin: plugin.alias, error: cause })
        }
      }
    },
  })
  ctx.registerService(service)
  return service
}
