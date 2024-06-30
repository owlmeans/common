import { Layer, MiddlewareStage, MiddlewareType } from '../consts.js'
import type { Middleware, Resource } from '../types.js'

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
