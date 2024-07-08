import { ACT_HOST, DEFAULT_ALIAS, DEFAULT_NAMESPACE } from './consts.js'
import type { KlusterConfig, KlusterService } from './types.js'
import { assertContext, createLazyService } from '@owlmeans/context'
import { KubeConfig, CoreV1Api, HttpError } from '@kubernetes/client-node'
import { ServerContext } from '@owlmeans/server-context'

type Config = KlusterConfig
type Context = ServerContext<Config>

export const makeKlusterService = (alias: string = DEFAULT_ALIAS): KlusterService => {
  const location = `kluster:${alias}`
  const service: KlusterService = createLazyService<KlusterService>(alias, {
    getHostnames: async selector => {
      try {
        const ctx = assertContext<Config, Context>(service.ctx as Context, location)
        const namespace = ctx.cfg.kluster?.namespace ?? DEFAULT_NAMESPACE

        const { body } = await service.api!.listNamespacedPod(
          namespace, undefined, undefined, undefined, undefined, selector
        )

        return body.items.map(item => item.status?.podIP).filter(name => name != null)
      } catch (e) {
        if (e instanceof HttpError) {
          console.error(e.name, e.cause, e.message, e.body)
        } else {
          throw e
        }
        return []
      }
    },

    dispatch: async <T>(action: string, query: string) => {
      switch (action) {
        case ACT_HOST:
          return service.getHostnames(query) as T
      }
      throw new SyntaxError(`Unknown kluster directive: ${action}`)
    }
  }, service => async () => {
    if (service.config == null || service.api == null) {
      service.config = new KubeConfig()
      service.config.loadFromDefault()
      service.api = service.config.makeApiClient(CoreV1Api)
    }

    service.initialized = true
  })

  return service
}
