import type { AppType, BasicContext, BasicConfig } from '@owlmeans/context'
import type { RouteMethod } from './consts'

export interface CommonRoute extends BasicRoute {
  type: AppType
  alias: string
  path: string
  parent?: string
  default?: boolean
  method?: RouteMethod
}

export interface CommonServiceRoute extends BasicRoute {
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

export interface ResolvedServiceRoute extends CommonServiceRoute {
  host: string
  resolved: true
}

export interface CommonRouteModel {
  route: CommonRoute
  resolve: <C extends BasicConfig, T extends BasicContext<C>>(context: T) => Promise<CommonRoute>
}

export interface RouteOptions extends Partial<CommonRoute> {
}
