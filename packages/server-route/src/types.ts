import type { CommonRoute, CommonRouteModel, CommonServiceRoute } from '@owlmeans/route'

export interface ServerRoute extends CommonRoute, ServerRouteExtras {
}

export interface ServiceRoute extends CommonServiceRoute, ServerRouteExtras {
}

export interface ServerRouteModel<R> extends CommonRouteModel {
  route: ServerRoute
  match: <Request extends R>(request: Request) => boolean
  isIntermediate: () => boolean
}

export interface ServerRouteExtras {
  internalHost?: string
  internalPort?: number
}

export interface ServerRouteOptions<R> {
  overrides?: Partial<ServerRoute>
  pathField?: string
  match?: <Request extends R>(request: Request) => boolean
}
