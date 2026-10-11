import type { RouteDeclaration, RouteModel, CommonServiceRoute } from '@owlmeans/route'

export interface ServerRoute extends RouteDeclaration, ServerRouteExtras {
}

export interface ServiceRoute extends CommonServiceRoute, ServerRouteExtras {
}

export interface ServerRouteModel<R> extends RouteModel {
  route: ServerRoute
  /**
   * Does this request hit the route? The mounted path comes from the caller — a declaration knows
   * only the segment it contributes, and composing the rest takes the context it is attached to.
   */
  match: <Request extends R>(request: Request, mount: string) => boolean
  isIntermediate: () => boolean
}

export interface ServerRouteExtras {
  internalHost?: string
  internalPort?: number
  opened?: boolean
}

export interface ServerRouteOptions<R> {
  overrides?: Partial<ServerRoute>
  pathField?: string
  match?: <Request extends R>(request: Request, mount: string) => boolean
}
