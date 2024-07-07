import type { BasicRoute, BasicRouteModel } from './utils'

export interface Route extends BasicRoute {
  partialPath: string
}

export interface RouteModel extends BasicRouteModel {
  route: Route
  _resolved?: Promise<void>
  _client: true
}

export interface RouteOptions {
  overrides?: Partial<Route>
}
