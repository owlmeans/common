import { Layer, MiddlewareStage, MiddlewareType } from '../consts.js'
import type { BasicConfig, BasicContext, Middleware, Resource, Service } from '../types.js'
import type { InLayer } from './layer.js'

export const getMiddlerwareKey = (middleware: Middleware) => createMiddlewareKey(middleware.type, middleware.stage)

export const createMiddlewareKey = (type: MiddlewareType, stage: MiddlewareStage) => `${type}:${stage}`

export const isLayerIherited = (current: Layer, parent: Layer): boolean =>
  current === parent || layersOrder.indexOf(current) > layersOrder.indexOf(parent)

export const isResourceAvailable = (resource: Resource, layer: Layer) =>
  resource.layer == null || isLayerIherited(resource.layer, layer)

export const layersOrder = [
  Layer.System,
  Layer.Global,
  Layer.Service,
  Layer.Entity,
  Layer.User
]

export const getAllServices = (services: InLayer<Record<string, Service>>, layer: Layer, id: string) => 
  services?.[layer]?.[id] != null ? Object.values(services[layer][id]) : []

export const applyMiddlewares = <C extends BasicConfig>(
  context: BasicContext<C>,
  middlewares: Record<string, Middleware[]>,
  type: MiddlewareType,
  stage: MiddlewareStage,
  args?: Record<string, string | undefined>
) => Promise.all(
  middlewares[createMiddlewareKey(type, stage)]?.map(async middleware => middleware.apply(context, args)) ?? []
)
