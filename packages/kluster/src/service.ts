import { ACT_HOST, ACT_SERVICE, DEFAULT_ALIAS, DEFAULT_NAMESPACE } from './consts.js'
import type { KlusterConfig, KlusterService } from './types.js'
import { assertContext, createLazyService } from '@owlmeans/context'
import { KubeConfig, CoreV1Api, HttpError, NetworkingV1Api, AppsV1Api } from '@kubernetes/client-node'
import { ServerContext } from '@owlmeans/server-context'
import { readConfigValue } from '@owlmeans/server-config'

// import util from 'node:util'

type Config = KlusterConfig
type Context = ServerContext<Config>

export const makeKlusterService = (alias: string = DEFAULT_ALIAS): KlusterService => {
  const location = `kluster:${alias}`

  const updateSelector = (selector: string): string =>
    selector.startsWith('/') || selector.startsWith('file:')
      ? readConfigValue(selector, selector) : selector

  const service: KlusterService = createLazyService<KlusterService>(alias, {
    getHostnames: async (selector, namespace) => {
      try {
        const ctx = assertContext<Config, Context>(service.ctx as Context, location)
        namespace ??= ctx.cfg.kluster?.namespace ?? DEFAULT_NAMESPACE

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

    getServiceHostname: async (selector, namespace) => {
      try {
        const ctx = assertContext<Config, Context>(service.ctx as Context, location)
        namespace ??= ctx.cfg.kluster?.namespace ?? DEFAULT_NAMESPACE

        const { body } = await service.api!.listNamespacedService(namespace, undefined, undefined, undefined, undefined, selector)

        // console.log(util.inspect(body, { depth: null, colors: true }))

        return body.items?.[0]?.spec?.clusterIP ?? null
      } catch (e) {
        if (e instanceof HttpError) {
          console.error(e.name, e.cause, e.message, e.body)
        } else {
          throw e
        }
        return selector
      }
    },

    dispatch: async <T>(action: string, query: string) => {
      query = updateSelector(query)
      switch (action) {
        case ACT_HOST:
          return service.getHostnames(query) as T
        case ACT_SERVICE:
          return service.getServiceHostname(query) as T
      }
      throw new SyntaxError(`Unknown kluster directive: ${action}`)
    },

    makeNetworkingApi: () => service.config!.makeApiClient(NetworkingV1Api),

    makeAppsApi: () => service.config!.makeApiClient(AppsV1Api),
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
