import type { BasicRoute, BasicRouteModel, BasicServiceRoute } from './uitls/types.js'

export interface Route extends BasicRoute {
  internalHost?: string
  internalPort?: string
}

export interface ServiceRoute extends BasicServiceRoute {
  internalHost?: string
  internalPort?: string
}

export interface RouteModel<R> extends BasicRouteModel {
  match: <Request extends R>(request: Request) => boolean
  isIntermediate: () => boolean
}
