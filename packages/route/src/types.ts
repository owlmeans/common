import type { AppType, Context } from '@owlmeans/context'
import type { RouteMethod } from './consts'

export interface Route extends BasicRoute {
  type: AppType
  alias: string
  path: string
  parent?: string
  default?: boolean
  method?: RouteMethod
}

export interface ServiceRoute extends BasicRoute {
  type: AppType
  service: string
  default?: boolean
}

export interface BasicRoute {
  type: AppType
  service?: string
  host?: string
  port?: number
  base?: string
  resolved: boolean
}

export interface ResolvedServiceRoute extends ServiceRoute {
  host: string
  resolved: true
}

export interface RouteModel {
  route: Route
  resolve: <C extends Context>(context: C) => Promise<Route>
}

export interface RouteOptions extends Partial<Route> {
}
