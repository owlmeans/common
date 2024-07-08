import { ContextStage, Layer, MiddlewareStage, MiddlewareType } from './consts.js'
import type { BasicConfig, BasicContext, Middleware, BasicModule, Resource, Service } from './types.js'
import { applyMiddlewares, getAllServices, getMiddlerwareKey, isResourceAvailable, layersOrder } from './utils/context.js'
import { DEFAULT, InLayer, Services, initializeLayer } from './utils/layer.js'

type Module = BasicModule

export const makeBasicContext = <C extends BasicConfig>(cfg: C): BasicContext<C> => {
  const services = {} as InLayer<Services>
  const modules = {} as Record<string, Module>
  const resources = {} as InLayer<Record<string, Resource>>
  const middlewares: Record<string, Middleware[]> = {}

  let configure: (res: boolean) => void
  let initialize: (resv: boolean) => void

  const configured = new Promise<boolean>(resolve => { configure = resolve })
  const initialized = new Promise<boolean>(resolve => { initialize = resolve })

  const contexts: Record<string, BasicContext<C>> = {}

  const inLazyInit = new Set<Service>()

  const context: BasicContext<C> = {
    cfg,

    stage: ContextStage.Configuration,

    waitForConfigured: () => configured,

    waitForInitialized: () => initialized,

    configure: <T>() => {
      void (async () => {
        await applyMiddlewares(context, middlewares, MiddlewareType.Config, MiddlewareStage.Configuration)

        context.stage = ContextStage.Loading
        configure(true)
      })()

      return context as T
    },

    init: <T>() => {
      void (async () => {
        await configured

        await applyMiddlewares(context, middlewares, MiddlewareType.Context, MiddlewareStage.Configuration)

        await Promise.all(
          getAllServices(services, context.cfg.layer, context.cfg.layerId ?? DEFAULT).map(async service => {
            console.log(`Initializing service ${service.alias}...`)
            if (!service.initialized) {
              if (service.init != null) {
                console.log(`... call init for ${service.alias}`)
                await service.init()
              }
              if (service.init == null && service.lazyInit == null) {
                service.initialized = true
              }
            }
          })
        )

        await applyMiddlewares(context, middlewares, MiddlewareType.Config, MiddlewareStage.Loading)

        await Promise.all(
          Object.values(resources).map(resource => isResourceAvailable(resource, context.cfg.layer) && resource.init?.())
        )

        await applyMiddlewares(context, middlewares, MiddlewareType.Context, MiddlewareStage.Loading)

        context.stage = ContextStage.Ready
        context.cfg.ready = true
        initialize(true)

        void applyMiddlewares(context, middlewares, MiddlewareType.Context, MiddlewareStage.Ready)
      })()

      return context as T
    },

    registerService: <T>(service: Service) => {
      const id = initializeLayer(services, context.cfg.layer, context.cfg.layerId)
      service = service.registerContext(context)

      if (services[context.cfg.layer][id][service.alias] == null) {
        services[context.cfg.layer][id][service.alias] = {}
      }

      service.layers?.forEach(layer => {
        services[context.cfg.layer][id][service.alias][layer] = service
      })
      if (services[context.cfg.layer][id][service.alias][DEFAULT] == null) {
        services[context.cfg.layer][id][service.alias][DEFAULT] = service
      }

      return context as T
    },

    registerModule: <T>(module: Module) => {
      module = module.registerContext(context)
      modules[module.alias] = module

      return context as T
    },

    registerModules: <T>(modules: Module[]) => {
      modules.forEach(module => context.registerModule(module))
      return context as T
    },

    registerResource: <T>(resource: Resource) => {
      const id = initializeLayer(resources, context.cfg.layer, context.cfg.layerId)
      resource = resource.registerContext(context)
      resources[context.cfg.layer][id][resource.alias] = resource

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
      const id = initializeLayer(services, context.cfg.layer, context.cfg.layerId)

      let _service: Service
      if (services[context.cfg.layer][id][alias]?.[context.cfg.layer] != null) {
        _service = services[context.cfg.layer][id][alias][context.cfg.layer]
      } else if (services[context.cfg.layer][id][alias]?.[DEFAULT] != null) {
        _service = services[context.cfg.layer][id][alias][DEFAULT]
      } else {
        throw new SyntaxError(`Service ${alias} not found in layer ${context.cfg.layer}`)
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

    module: <T>(alias: string) => {
      if (modules[alias] != null) {
        return modules[alias] as T
      }
      throw new SyntaxError(`Module ${alias} not found`)
    },

    resource: <T>(alias: string) => {
      const id = initializeLayer(resources, context.cfg.layer, context.cfg.layerId)
      if (resources[context.cfg.layer][id][alias] != null) {
        return resources[context.cfg.layer][id][alias] as T
      }
      throw new SyntaxError(`Resource ${alias} not found`)
    },

    modules: <T>() => Object.values(modules) as T[],

    updateContext: <T>(id?: string, layer?: Layer) => {
      const index = layersOrder.indexOf(context.cfg.layer)
      layer = layer ?? (layersOrder[index + 1] != null ? layersOrder[index + 1] : undefined)
      if (layer == null) {
        throw new SyntaxError("There is no next layer to switch to")
      }
      if (id == null && layer === Layer.Service) {
        id = context.cfg.service
      }
      if ([Layer.Entity, Layer.User].includes(layer) && id == null) {
        throw new SyntaxError(`Cannot switch to layer ${layer} without id`)
      }

      // Cache initalized context layers
      const key = `${layer}:${id}`
      if (key in contexts) {
        return contexts[key] as T
      }

      const _config: C = JSON.parse(JSON.stringify(context.cfg))
      _config.layer = layer
      _config.ready = false
      _config.layerId = id
      // @TODO we need to make a rule to store all makeContext methods after they are applied
      const _context = context.makeContext != null ? context.makeContext(_config) : makeBasicContext(_config)

      id = initializeLayer(resources, layer, id)

      applyMiddlewares(_context, middlewares, MiddlewareType.Config, MiddlewareStage.Switching, { layer, id })

      getAllServices(services, layer, id).forEach(service => _context.registerService(service))

      Object.values(modules).forEach(module => _context.registerModule(module))

      Object.values(resources[layer][id]).forEach(resource => _context.registerResource(resource))

      Object.values(middlewares).flatMap(middlewares => middlewares)
        .forEach(middleware => _context.registerMiddleware(middleware))

      applyMiddlewares(_context, middlewares, MiddlewareType.Context, MiddlewareStage.Switching, { layer, id })
        .then(() => _context.configure().init())

      return (contexts[key] = _context) as T
    }
  }

  return context
}
