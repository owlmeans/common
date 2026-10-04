import { createLazyService } from '@owlmeans/context'
import type { BasicContext, LazyService } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import { logger } from '@owlmeans/log'

const log = logger('client-entrypoint')

export const ENTRYPOINT_FAILURE_SERVICE = 'client-entrypoint:failure'

export interface EntrypointFailure {
  alias: string
  request: AbstractRequest
  error: unknown
}

export interface EntrypointFailurePlugin {
  alias: string
  onFailure: (failure: EntrypointFailure) => void | Promise<void>
}

export interface EntrypointFailureService extends LazyService {
  registerPlugin: (plugin: EntrypointFailurePlugin) => void
  notify: (failure: EntrypointFailure) => Promise<void>
}

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
