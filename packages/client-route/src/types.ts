import type { CommonRoute, CommonRouteModel } from '@owlmeans/route'

export interface ClientRoute extends CommonRoute {
  partialPath: string
}

export interface ClientRouteModel extends CommonRouteModel {
  route: ClientRoute
  _resolved?: Promise<void>
  _client: true
}

export interface ClientRouteOptions {
  overrides?: Partial<ClientRoute>
}
