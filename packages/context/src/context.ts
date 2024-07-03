import { ContextStage, Layer, MiddlewareStage, MiddlewareType } from './consts.js'
import type { Config, Context, Middleware, Module, Resource, Service } from './types.js'
import { applyMiddlewares, getAllServices, getMiddlerwareKey, isResourceAvailable, layersOrder } from './utils/context.js'
import { DEFAULT, InLayer, Services, initializeLayer } from './utils/layer.js'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const services = {} as InLayer<Services>
  const modules = {} as Record<string, Module>
  const resources = {} as InLayer<Record<string, Resource>>
  const middlewares: Record<string, Middleware[]> = {}

  let configure: (res: boolean) => void
  let initialize: (resv: boolean) => void

  const configured = new Promise<boolean>(resolve => { configure = resolve })
  const initialized = new Promise<boolean>(resolve => { initialize = resolve })

  const contexts: Record<string, Context> = {}

  const inLazyInit = new Set<Service>()

  const context: T = {
    cfg,

    stage: ContextStage.Configuration,

    waitForConfigured: () => configured,

    waitForInitialized: () => initialized,

    configure: () => {
      void (async () => {
        await applyMiddlewares(context, middlewares, MiddlewareType.Config, MiddlewareStage.Configuration)

        context.stage = ContextStage.Loading
        configure(true)
      })()

      return context
    },

    init: () => {
      void (async () => {
        await configured

        await applyMiddlewares(context, middlewares, MiddlewareType.Context, MiddlewareStage.Configuration)

        await Promise.all(
          getAllServices(services, context.cfg.layer, context.cfg.layerId ?? DEFAULT).map(async service => {
            if (!service.initialized) {
              if (service.init != null) {
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
      })()

      return context
    },

    registerService: service => {
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

      return context
    },

    registerModule: module => {
      module = module.registerContext(context)
      modules[module.alias] = module

      return context
    },

    registerModules: modules => {
      modules.forEach(module => context.registerModule(module))
      return context
    },

    registerResource: resource => {
      const id = initializeLayer(resources, context.cfg.layer, context.cfg.layerId)
      resource = resource.registerContext(context)
      resources[context.cfg.layer][id][resource.alias] = resource

      return context
    },

    registerMiddleware: middleware => {
      const key = getMiddlerwareKey(middleware)
      if (!(key in middlewares)) {
        middlewares[key] = []
      }
      middlewares[key].push(middleware)

      return context
    },

    get config() {
      return configured.then(() => context.cfg)
    },

    service: alias => {
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
      return _service
    },

    module: alias => {
      if (modules[alias] != null) {
        return modules[alias]
      }
      throw new SyntaxError(`Module ${alias} not found`)
    },

    resource: alias => {
      const id = initializeLayer(resources, context.cfg.layer, context.cfg.layerId)
      if (resources[context.cfg.layer][id][alias] != null) {
        return resources[context.cfg.layer][id][alias]
      }
      throw new SyntaxError(`Resource ${alias} not found`)
    },

    modules: () => Object.values(modules),

    updateContext: id => {
      const index = layersOrder.indexOf(context.cfg.layer)
      const layer: Layer | undefined = layersOrder[index + 1] != null ? layersOrder[index + 1] : undefined
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
        return contexts[key]
      }

      const _config: C = JSON.parse(JSON.stringify(context.cfg))
      _config.layer = layer
      _config.ready = false
      _config.layerId = id
      const _context = makeContext(_config)

      id = initializeLayer(resources, layer, id)

      applyMiddlewares(_context, middlewares, MiddlewareType.Config, MiddlewareStage.Switching, { layer, id })
        .then(() => _context.configure().init())

      getAllServices(services, layer, id).forEach(service => _context.registerService(service))

      Object.values(modules).forEach(module => _context.registerModule(module))

      Object.values(resources[layer][id]).forEach(resource => _context.registerResource(resource))

      Object.values(middlewares).flatMap(middlewares => middlewares)
        .forEach(middleware => _context.registerMiddleware(middleware))

      applyMiddlewares(_context, middlewares, MiddlewareType.Context, MiddlewareStage.Switching, { layer, id })
        .then(() => _context.configure().init())

      return contexts[key] = _context
    }
  } as T

  return context
}
