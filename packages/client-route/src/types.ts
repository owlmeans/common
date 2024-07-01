import type { BasicRoute, BasicRouteModel } from './utils'

export interface Route extends BasicRoute {
  params?: string[]
}

export interface RouteModel extends BasicRouteModel {
  _client: true
}

export interface RouteOptions {
  overrides?: Partial<Route>
}
