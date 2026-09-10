import { ContextStage, MiddlewareStage, MiddlewareType } from './consts.js'
import type { BasicConfig, BasicContext, Middleware, BasicEntrypoint, BasicResource, Service } from './types.js'
import { applyMiddlewares, getMiddlerwareKey } from './utils/context.js'

type Entrypoint = BasicEntrypoint

export const makeBasicContext = <C extends BasicConfig>(cfg: C): BasicContext<C> => {
  /**
   * One flat registry per kind, keyed by alias. Registering an alias twice replaces the
   * earlier entry — application entrypoint lists are routinely spread together and the
   * later declaration is the one the app means.
   */
  const services: Record<string, Service> = {}
  const entrypoints: Record<string, Entrypoint> = {}
  const resources: Record<string, BasicResource> = {}
  const middlewares: Record<string, Middleware[]> = {}

  let configure: (res: boolean) => void
  let initialize: (resv: boolean) => void

  const configured = new Promise<boolean>(resolve => { configure = resolve })
  const initialized = new Promise<boolean>(resolve => { initialize = resolve })

  const inLazyInit = new Set<Service>()

  const context: BasicContext<C> = {
    cfg,

    stage: ContextStage.Configuration,

    waitForConfigured: () => configured,

    waitForInitialized: () => initialized,

    configure: <T>() => {
      if (context.stage !== ContextStage.Configuration) {
        configure(true)
        return context as T
      }

      void (async () => {
        await applyMiddlewares<C, BasicContext<C>>(context, middlewares, MiddlewareType.Config, MiddlewareStage.Configuration)

        context.stage = ContextStage.Loading
        configure(true)
      })()

      return context as T
    },

    init: async <T>() => {
      await configured

      if (context.stage !== ContextStage.Loading) {
        return context as T
      }

      await applyMiddlewares<C, BasicContext<C>>(context, middlewares, MiddlewareType.Context, MiddlewareStage.Configuration)

      await Object.values(services).reduce(
        async (previous, service) => {
          await previous
          if (!service.initialized) {
            if (service.init != null) {
              await service.init()
            }
            if (service.init == null && service.lazyInit == null) {
              service.initialized = true
            }
          }
        }
        , Promise.resolve())

      await applyMiddlewares<C, BasicContext<C>>(context, middlewares, MiddlewareType.Config, MiddlewareStage.Loading)

      await Object.values(resources).reduce(async (previous, resource) => {
        await previous
        await resource.init?.()
      }, Promise.resolve())

      await applyMiddlewares<C, BasicContext<C>>(context, middlewares, MiddlewareType.Context, MiddlewareStage.Loading)

      context.stage = ContextStage.Ready
      context.cfg.ready = true
      initialize(true)

      void applyMiddlewares<C, BasicContext<C>>(context, middlewares, MiddlewareType.Context, MiddlewareStage.Ready)

      return context as T
    },

    registerService: <T>(service: Service) => {
      services[service.alias] = service.registerContext(context)

      return context as T
    },

    registerEntrypoint: <T>(entrypoint: Entrypoint) => {
      entrypoints[entrypoint.alias] = entrypoint.registerContext(context)

      return context as T
    },

    registerEntrypoints: <T>(eps: Entrypoint[]) => {
      eps.forEach(ep => context.registerEntrypoint(ep))
      return context as T
    },

    registerResource: <T>(resource: BasicResource) => {
      resources[resource.alias] = resource.registerContext(context)

      return context as T
    },

    registerMiddleware: <T>(middleware: Middleware) => {
      const key = getMiddlerwareKey(middleware)
      if (!(key in middlewares)) {
        middlewares[key] = []
      }
      middlewares[key].push(middleware)

      return context as T
    },

    get config() {
      return configured.then(() => context.cfg)
    },

    service: <T>(alias: string) => {
      const _service = services[alias]
      if (_service == null) {
        throw new SyntaxError(`Service ${alias} not found`)
      }
      if (!_service.initialized) {
        if (_service.lazyInit != null) {
          if (!inLazyInit.has(_service)) {
            inLazyInit.add(_service)
            _service.lazyInit()
              .then(() => _service.initialized = true)
              .finally(() => inLazyInit.delete(_service))
          }
        } else {
          throw new SyntaxError(`Service ${alias} is not initialized`)
        }
      }
      return _service as T
    },

    entrypoint: <T extends Entrypoint>(alias: string) => {
      if (entrypoints[alias] != null) {
        return entrypoints[alias] as T
      }
      throw new SyntaxError(`Entrypoint ${alias} not found`)
    },

    resource: <T extends BasicResource>(alias: string) => {
      if (resources[alias] != null) {
        return resources[alias] as T
      }
      throw new SyntaxError(`Resource ${alias} not found`)
    },

    entrypoints: <T extends Entrypoint>() => Object.values(entrypoints) as T[],

    hasResource: alias => resources[alias] != null,

    hasService: alias => services[alias] != null,

    hasEntrypoint: alias => entrypoints[alias] != null,
  }

  return context
}
