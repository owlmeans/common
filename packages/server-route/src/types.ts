import type { BasicRoute, BasicRouteModel, BasicServiceRoute } from './uitls/types.js'

export interface Route extends BasicRoute, RouteExtras {
}

export interface ServiceRoute extends BasicServiceRoute, RouteExtras {
}

export interface RouteModel<R> extends BasicRouteModel {
  route: Route
  match: <Request extends R>(request: Request) => boolean
  isIntermediate: () => boolean
}

export interface RouteExtras {
  internalHost?: string
  internalPort?: string
}

export interface RouteOptions<R> {
  overrides?: Partial<Route>
  pathField?: string
  match?: <Request extends R>(request: Request) => boolean
}
