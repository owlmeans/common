import type { RouteDeclaration, RouteModel } from '@owlmeans/route'

export interface ClientRoute extends RouteDeclaration {
}

/**
 * A route declaration marked as belonging to the client side. It carries no state of its own —
 * the segment, path and address are computed by the entrypoint against the context that asks.
 */
export interface ClientRouteModel extends RouteModel {
  route: ClientRoute
  _client: true
}

export interface ClientRouteOptions {
  overrides?: Partial<ClientRoute>
}
