import { ContextStage, Layer, MiddlewareStage, MiddlewareType } from './consts.js'
import type { BasicConfig, BasicContext, Middleware, BasicModule, BasicResource, Service } from './types.js'
// import { applyMiddlewares, getAllServices, getMiddlerwareKey, isResourceAvailable, layersOrder } from './utils/context.js'
import { applyMiddlewares, getAllServices, getMiddlerwareKey, isResourceAvailable } from './utils/context.js'
import { DEFAULT, InLayer, initializeLayer } from './utils/layer.js'

type Module = BasicModule

export const makeBasicContext = <C extends BasicConfig>(cfg: C): BasicContext<C> => {
  const services = {} as InLayer<Record<string, Service>>
  const modules = {} as InLayer<Record<string, Module>>
  const resources = {} as InLayer<Record<string, BasicResource>>
  const middlewares: Record<string, Middleware[]> = {}
  const allServices: Record<string, Service> = {}
  const allModules: Record<string, Module> = {}
  const allResources: Record<string, BasicResource> = {}

  let configure: (res: boolean) => void
  let initialize: (resv: boolean) => void

  const configured = new Promise<boolean>(resolve => { configure = resolve })
  const initialized = new Promise<boolean>(resolve => { initialize = resolve })

  // const contexts: Record<string, BasicContext<C>> = {}

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

      await getAllServices(services, context.cfg.layer, context.cfg.layerId ?? DEFAULT).reduce(
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

      const id = initializeLayer(resources, context.cfg.layer, context.cfg.layerId ?? DEFAULT)
      await Object.values(resources[context.cfg.layer][id]).reduce(async (previous, resource) => {
        await previous
        if (isResourceAvailable(resource, context.cfg.layer)) {
          await resource.init?.()
        }
      }, Promise.resolve())

      await applyMiddlewares<C, BasicContext<C>>(context, middlewares, MiddlewareType.Context, MiddlewareStage.Loading)

      context.stage = ContextStage.Ready
      context.cfg.ready = true
      initialize(true)

      void applyMiddlewares<C, BasicContext<C>>(context, middlewares, MiddlewareType.Context, MiddlewareStage.Ready)

      return context as T
    },

    registerService: <T>(service: Service) => {
      const id = initializeLayer(services, context.cfg.layer, context.cfg.layerId)
      service = service.registerContext(context)

      if (allServices[service.alias] == null) {
        allServices[service.alias] = service
      }
      services[context.cfg.layer][id][service.alias] = service

      return context as T
    },

    registerModule: <T>(module: Module) => {
      const id = initializeLayer(modules, context.cfg.layer, context.cfg.layerId)
      module = module.registerContext(context)
      if (allModules[module.alias] == null) {
        allModules[module.alias] = module
      }
      modules[context.cfg.layer][id][module.alias] = module

      return context as T
    },

    registerModules: <T>(modules: Module[]) => {
      modules.forEach(module => context.registerModule(module))
      return context as T
    },

    registerResource: <T>(resource: BasicResource) => {
      const id = initializeLayer(resources, context.cfg.layer, context.cfg.layerId)
      resource = resource.registerContext(context)
      if (allResources[resource.alias] == null) {
        allResources[resource.alias] = resource
      }
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
      if (services[context.cfg.layer]?.[id]?.[alias] != null) {
        _service = services[context.cfg.layer][id][alias]
      } else if (services[Layer.Global]?.[id]?.[alias] != null) {
        _service = services[context.cfg.layer][id][alias]
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
      const id = initializeLayer(modules, context.cfg.layer, context.cfg.layerId)
      if (modules[context.cfg.layer][id][alias] != null) {
        return modules[context.cfg.layer][id][alias] as T
      }
      throw new SyntaxError(`Module ${alias} not found`)
    },

    resource: <T extends BasicResource>(alias: string) => {
      const id = initializeLayer(resources, context.cfg.layer, context.cfg.layerId)
      if (resources[context.cfg.layer][id][alias] != null) {
        const resource = resources[context.cfg.layer][id][alias] as T

        return resource
      }
      throw new SyntaxError(`Resource ${alias} not found`)
    },

    modules: <T>() => {
      const id = initializeLayer(modules, context.cfg.layer, context.cfg.layerId)
      return Object.values(modules[context.cfg.layer][id]) as T[]
    },

    /**
     * @TODO Unfortunatly module cloning between contexts is quite unstable.
     * And it looks like in some cases it relies on modules that aren't really clonned.
     * The problem is that the not cloned modules are changing their context accross all context
     * layers and we can't rely on such behaviour.
     * So we disabled context update as a whole and all functionality that relies on it
     * cause in curent release mixed tenancy is not in use in any project and it looks like
     * there is no short term plans to use it some way. 
     */
    updateContext: async <T>(_id?: string, _layer?: Layer) => {
      return context as T

      // const index = layersOrder.indexOf(context.cfg.layer)
      // layer = layer ?? (layersOrder[index + 1] != null ? layersOrder[index + 1] : undefined)
      // if (layer == null) {
      //   throw new SyntaxError("There is no next layer to switch to")
      // }

      // if ([Layer.Entity, Layer.User].includes(layer) && id == null) {
      //   throw new SyntaxError(`Cannot switch to layer ${layer} without id`)
      // }

      // id = initializeLayer(resources, layer, id)

      // // Cache initalized context layers
      // const key = `${layer}:${id}`
      // if (key in contexts) {
      //   return contexts[key] as T
      // }

      // const _config: C = JSON.parse(JSON.stringify(context.cfg))
      // _config.layer = layer
      // _config.ready = false
      // _config.layerId = id
      // // @TODO we need to make a rule to store all makeContext methods after they are applied
      // const _context = context.makeContext != null ? context.makeContext(_config) : makeBasicContext(_config)

      // Object.values(middlewares).flatMap(middlewares => middlewares)
      //   .forEach(middleware => _context.registerMiddleware(middleware))

      // await applyMiddlewares<C, BasicContext<C>>(_context, middlewares, MiddlewareType.Config, MiddlewareStage.Switching, { layer, id })

      // Object.values(allServices).forEach(service => _context.registerService(service))

      // Object.values(allModules).forEach(module => _context.registerModule(module))

      // Object.values(allResources).forEach(resource => _context.registerResource(resource))

      // await applyMiddlewares<C, BasicContext<C>>(_context, middlewares, MiddlewareType.Context, MiddlewareStage.Switching, { layer, id })

      // _context.stage = ContextStage.Loading
      // await _context.configure().init()

      // return (contexts[key] = _context) as T
    },

    hasResource: alias => allResources[alias] != null,

    hasService: alias => allServices[alias] != null
  }

  return context
}
